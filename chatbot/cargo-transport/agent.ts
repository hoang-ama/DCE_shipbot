import { callPassengerQwen, parsePassengerQwenJson } from '../passenger-transport/qwen-client';
import { cleanCustomerName, cleanVietnamesePhone, isExplicitFieldClear } from '../common/field-validation';
import { callGemini, Type } from '../../src/chatbot/services/gemini-client';
import { ChainError } from '../../src/chatbot/chains/trace';

type CargoService = 'express' | 'truck' | null;
type Fields = Record<string, unknown>;
type Draft = { service: CargoService; fields: Fields };
const drafts = new Map<string, Draft>();
const norm = (text: string) => text.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/đ/gu, 'd').trim();
const keys = ['contactName', 'contactPhone', 'pickup', 'destination', 'items', 'time', 'vehicle'];
const fieldLabels: Record<string, string> = { contactName: 'Tên người liên hệ', contactPhone: 'Số điện thoại', pickup: 'Địa chỉ lấy hàng', destination: 'Địa chỉ giao hàng', items: 'Danh sách hàng và số lượng', time: 'Ngày giờ vận chuyển', vehicle: 'Loại xe tải' };

function explicitService(message: string): CargoService {
  const text = norm(message);
  if (/(?:giao nhanh|chuyen phat nhanh|express|gui hang nhanh)/u.test(text)) return 'express';
  if (/(?:xe tai|chuyen do|chuyen nha|van chuyen do|cho hang bang xe tai)/u.test(text)) return 'truck';
  return null;
}

function validField(key: string, value: unknown): unknown {
  if (key === 'contactName') return cleanCustomerName(value);
  if (key === 'contactPhone') return cleanVietnamesePhone(value);
  if (key === 'items') {
    if (!Array.isArray(value)) return null;
    const items = value.slice(0, 20).flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Record<string, unknown>;
      const name = typeof row.name === 'string' ? row.name.trim().slice(0, 160) : '';
      const quantity = Number(String(row.quantity ?? 1).replace(/[^\d]/gu, ''));
      if (!name || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000) return [];
      return [{ name, quantity: String(quantity), weight: typeof row.weight === 'string' ? row.weight.trim().slice(0, 100) : '', dimensions: typeof row.dimensions === 'string' ? row.dimensions.trim().slice(0, 100) : '' }];
    });
    return items.length ? items : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= 500 ? text : null;
}

function normalizeCargoFields(extracted: Fields) {
  const aliases: Record<string, string> = {
    name: 'contactName', fullname: 'contactName', customername: 'contactName', sendername: 'contactName', contactname: 'contactName',
    phone: 'contactPhone', mobile: 'contactPhone', telephone: 'contactPhone', tel: 'contactPhone', phonenumber: 'contactPhone', customerphone: 'contactPhone', senderphone: 'contactPhone', contactphone: 'contactPhone',
    pickupaddress: 'pickup', pickuplocation: 'pickup', origin: 'pickup', from: 'pickup',
    deliveryaddress: 'destination', destinationaddress: 'destination', dropoff: 'destination', dropoffaddress: 'destination', to: 'destination', receiveraddress: 'destination',
    requestedat: 'time', deliverytime: 'time', datetime: 'time', date: 'time', schedule: 'time', pickupat: 'time', pickupdatetime: 'time',
    trucktype: 'vehicle', vehicletype: 'vehicle', handling: 'vehicle',
    goods: 'items', products: 'items', cargo: 'items', cargoitems: 'items', item: 'items', product: 'items', itemname: 'itemName', productname: 'itemName', cargoname: 'itemName', goodsname: 'itemName',
    itemquantity: 'quantity', count: 'quantity', qty: 'quantity', weightkg: 'weight', dimension: 'dimensions', size: 'dimensions',
  };
  const keyOf = (key: string) => key.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/đ/gu, 'd').replace(/[^a-z0-9]/gu, '');
  const itemRows = (value: unknown): Array<{ name: string; quantity: string; weight: string; dimensions: string }> => {
    const rows = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : typeof value === 'string' ? [{ name: value }] : [];
    return rows.slice(0, 20).flatMap((item) => {
      const row = typeof item === 'string' ? { name: item } : item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const get = (...names: string[]) => {
        for (const [key, val] of Object.entries(row)) if (names.includes(keyOf(key)) && val !== null && val !== undefined && String(val).trim()) return String(val).trim();
        return '';
      };
      const name = get('name', 'itemname', 'productname', 'cargo', 'goods').slice(0, 160);
      if (!name) return [];
      return [{ name, quantity: get('quantity', 'qty', 'count', 'itemquantity') || '1', weight: get('weight', 'weightkg'), dimensions: get('dimensions', 'dimension', 'size', 'volume') }];
    });
  };
  const normalized: Fields = {};
  let itemName = '', itemQuantity = '', itemWeight = '', itemDimensions = '';
  const setIfEmpty = (key: string, value: unknown) => {
    if (!(key in normalized) || normalized[key] === undefined || normalized[key] === null || normalized[key] === '') normalized[key] = value;
  };
  for (const [key, value] of Object.entries(extracted)) {
    const folded = keyOf(key);
    if (['contact', 'customer', 'sender', 'receiver', 'delivery'].includes(folded) && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
        const canonical = aliases[keyOf(nestedKey)];
        if (canonical === 'contactName' || canonical === 'contactPhone') setIfEmpty(canonical, nestedValue);
        if (keyOf(nestedKey) === 'address') setIfEmpty(folded === 'receiver' || folded === 'delivery' ? 'destination' : 'pickup', nestedValue);
      }
      continue;
    }
    const canonical = aliases[folded] || folded;
    if (canonical === 'itemName') { itemName = String(value ?? '').trim(); continue; }
    if (canonical === 'quantity') { itemQuantity = String(value ?? '').trim(); continue; }
    if (canonical === 'weight') { itemWeight = String(value ?? '').trim(); continue; }
    if (canonical === 'dimensions') { itemDimensions = String(value ?? '').trim(); continue; }
    if (canonical === 'items') { const rows = itemRows(value); if (rows.length) setIfEmpty('items', rows); continue; }
    if (['contactName', 'contactPhone', 'pickup', 'destination', 'time', 'vehicle'].includes(canonical)) {
      const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
      const cleanValue = record ? record.address ?? record.value ?? record.text ?? record.name : value;
      setIfEmpty(canonical, cleanValue);
    }
  }
  if (!Array.isArray(normalized.items) && itemName) normalized.items = [{ name: itemName, quantity: itemQuantity || '1', weight: itemWeight, dimensions: itemDimensions }];
  else if (Array.isArray(normalized.items) && normalized.items.length) {
    const first = normalized.items[0] as Record<string, unknown>;
    normalized.items = [{ ...first, quantity: itemQuantity || first.quantity || '1', weight: itemWeight || first.weight || '', dimensions: itemDimensions || first.dimensions || '' }, ...normalized.items.slice(1)];
  }
  for (const key of keys) if (extracted[key] !== undefined) {
    const canonicalValue = key === 'items' ? itemRows(extracted[key]) : extracted[key];
    if (key === 'items') { if (Array.isArray(canonicalValue) && canonicalValue.length) normalized[key] = canonicalValue; }
    else normalized[key] = canonicalValue;
  }
  return normalized;
}

function requiredKeys(service: CargoService) {
  if (!service) return [];
  return ['contactName', 'contactPhone', 'pickup', 'destination', 'items', 'time', ...(service === 'truck' ? ['vehicle'] : [])];
}
const missingKeys = (service: CargoService, fields: Fields) => requiredKeys(service).filter((key) => fields[key] === undefined || fields[key] === null || fields[key] === '');
function hasCargoDetails(message: string) {
  return /(?:lấy hàng|địa chỉ|giao đến|giao hàng|số điện thoại|sđt|mặt hàng|thùng|kg|kiện|bao nhiêu|ngày mai|hôm nay|lúc\s*\d|xe tải\s*\d)/iu.test(message);
}

const variants: Record<string, string[]> = {
  contactName: ['Anh/chị cho em xin tên người liên hệ ạ?', 'Mình cho em xin tên người gửi hoặc người nhận nhé?', 'Em xin tên người đặt vận chuyển để ghi nhận yêu cầu ạ?'],
  contactPhone: ['Anh/chị gửi em số điện thoại liên hệ nhé?', 'Em xin số điện thoại người gửi hoặc nhận ạ?', 'Mình cho em xin số để bên vận chuyển liên hệ nhé?'],
  pickup: ['Địa chỉ lấy hàng ở đâu ạ?', 'Anh/chị gửi em địa chỉ cần lấy hàng nhé?', 'Mình muốn lấy hàng tại địa chỉ nào ạ?'],
  destination: ['Địa chỉ giao hàng ở đâu ạ?', 'Anh/chị cho em xin địa chỉ nhận hàng nhé?', 'Mình cần giao hàng đến đâu ạ?'],
  items: ['Anh/chị gửi em tên hàng và số lượng cần vận chuyển nhé?', 'Mình cần chuyển mặt hàng gì, số lượng bao nhiêu ạ?', 'Em xin danh sách hàng và số lượng từng loại nhé?'],
  time: ['Anh/chị muốn vận chuyển vào ngày, giờ nào ạ?', 'Mình dự kiến lấy hàng lúc nào nhé?', 'Cho em xin khung giờ vận chuyển mong muốn ạ?'],
  vehicle: ['Anh/chị cần loại xe tải nào ạ?', 'Mình muốn dùng xe tải trọng tải bao nhiêu?', 'Em xin loại xe tải phù hợp anh/chị mong muốn nhé?'],
};
const pairTemplates: Record<string, string[]> = {
  'contactName+contactPhone': ['Anh/chị cho em xin tên người liên hệ và số điện thoại nhé?', 'Mình gửi em tên cùng số điện thoại để bên vận chuyển liên hệ ạ?', 'Em xin tên và số điện thoại của người gửi hoặc nhận hàng nhé?'],
  'pickup+destination': ['Anh/chị cho em xin địa chỉ lấy hàng và địa chỉ giao hàng nhé?', 'Mình muốn lấy hàng ở đâu và giao đến địa chỉ nào ạ?', 'Em xin điểm lấy hàng cùng điểm giao hàng để ghi nhận ạ?'],
  'items+time': ['Anh/chị cho em biết mặt hàng, số lượng và thời gian muốn vận chuyển nhé?', 'Mình cần chuyển hàng gì, bao nhiêu món và vào lúc nào ạ?', 'Em xin danh sách hàng cùng khung giờ vận chuyển mong muốn nhé?'],
  'time+vehicle': ['Anh/chị muốn vận chuyển lúc nào và cần loại xe tải nào ạ?', 'Mình cho em xin thời gian lấy hàng cùng loại xe tải nhé?', 'Em xin khung giờ mong muốn và loại xe tải phù hợp ạ?'],
};
function pick(items: string[]) { return items[Math.floor(Math.random() * items.length)]; }
function ruleReply(service: CargoService, fields: Fields): string {
  if (!service) return pick(['Anh/chị cần giao nhanh (Express) hay chuyển đồ bằng xe tải ạ?', 'Mình muốn gửi hàng giao nhanh hay cần xe tải chuyển đồ nhé?', 'Em hỗ trợ giao nhanh hoặc thuê xe tải chuyển hàng. Anh/chị đang cần dịch vụ nào ạ?']);
  const missing = missingKeys(service, fields);
  if (!missing.length) return 'Dạ, em đã ghi nhận đủ thông tin vận chuyển thử nghiệm ạ.';
  const first = missing[0], second = missing[1];
  const pair = second ? pairTemplates[`${first}+${second}`] : undefined;
  return pick(pair || variants[first] || ['Anh/chị cho em xin thêm thông tin vận chuyển nhé?']);
}

function merge(target: Fields, extracted: Fields, message: string) {
  const fields = { ...target }, accepted: string[] = [], forcedNull: string[] = [];
  for (const key of keys) {
    if (!(key in extracted)) continue;
    const raw = extracted[key];
    if ((raw === null || raw === '') && isExplicitFieldClear(message, key)) {
      if (fields[key] !== null) { fields[key] = null; accepted.push(key); }
      continue;
    }
    if (raw === null || raw === undefined || raw === '') continue;
    const value = validField(key, raw);
    if (value === null) { fields[key] = null; forcedNull.push(key); continue; }
    if (JSON.stringify(fields[key]) !== JSON.stringify(value)) { fields[key] = value; accepted.push(key); }
  }
  return { fields, accepted, forcedNull };
}

const systemPrompt = 'Bạn là mô-đun trích xuất dữ liệu cho thử nghiệm chuyển hàng. Chỉ trích xuất điều khách đã nói rõ từ tin mới nhất và tối đa 5 lượt chat. Không viết câu trả lời. Không bịa. Chỉ trả JSON {"service":"express"|"truck"|null,"fields":{...}}. Dùng đúng các khóa chuẩn contactName, contactPhone, pickup, destination, items, time, vehicle; không đổi tên hoặc lồng các trường tùy ý. Chỉ gồm trường khách vừa nêu hoặc sửa; trường không có thì bỏ qua. Khách yêu cầu xóa thì giá trị là null. contactName là tên cụ thể, không lấy đại từ xưng hô. contactPhone giữ nguyên số khách đưa. pickup là địa chỉ lấy, destination là địa chỉ giao, items là mảng {name,quantity,weight,dimensions}, time là ngày giờ mong muốn, vehicle là loại xe tải. Chọn express/truck chỉ khi khách nói rõ.';

async function extractGemini(message: string, history: Array<{ role: string; content: string }>, service: CargoService, fields: Fields) {
  const itemSchema = { type: Type.OBJECT, properties: { name: { type: Type.STRING }, quantity: { type: Type.STRING }, weight: { type: Type.STRING }, dimensions: { type: Type.STRING } } };
  const schema = { type: Type.OBJECT, required: ['fields'], properties: { service: { type: Type.STRING, enum: ['express', 'truck', 'unknown'] }, fields: { type: Type.OBJECT, properties: { contactName: { type: Type.STRING }, contactPhone: { type: Type.STRING }, pickup: { type: Type.STRING }, destination: { type: Type.STRING }, items: { type: Type.ARRAY, items: itemSchema }, time: { type: Type.STRING }, vehicle: { type: Type.STRING } } } } };
  const result = await callGemini('Bạn chỉ trích xuất dữ liệu chuyển hàng từ nội dung khách đã nói. Không viết lời đáp cho khách, không bịa thông tin. Bỏ qua trường không được nói rõ. Khách yêu cầu xóa trường thì trả null. Chỉ trả JSON {service,fields}.', { message, history: history.slice(-5), service, fields }, schema);
  const value = result.value || {};
  return { service: value.service === 'express' || value.service === 'truck' ? value.service as CargoService : null, fields: value.fields && typeof value.fields === 'object' && !Array.isArray(value.fields) ? value.fields as Fields : {}, detail: result.detail };
}

export async function runCargoAgentTurn(input: { experimentId: string; message: string; history?: Array<{ role: string; content: string }>; currentInfo?: Record<string, any> }) {
  const started = Date.now(), id = String(input.experimentId || 'cargo-experiment').slice(0, 120), message = String(input.message || '').trim();
  const trace: Array<{ step: string; status: 'ok' | 'skip' | 'error' | 'info'; detail?: unknown }> = [{ step: 'cargo_agent', status: 'ok', detail: { experimentId: id } }];
  const prior = drafts.get(id);
  let service: CargoService = prior?.service || (input.currentInfo?.subVertical === 'express' || input.currentInfo?.subVertical === 'truck' ? input.currentInfo.subVertical : null);
  const fields: Fields = { ...(prior?.fields || input.currentInfo?.serviceDraft?.fields || {}) };
  const selectedNow = explicitService(message);
  if (!service && selectedNow) { service = selectedNow; trace.push({ step: 'rule_service_selection', status: 'ok', detail: { service } }); }
  if (!service && /^(?:chào(?: bạn| em| anh| chị)?|xin chào|hi|hello|alo|dạ)[.!\s]*$/iu.test(message)) {
    const reply = ruleReply(null, fields);
    trace.push({ step: 'rule_reply', status: 'ok', detail: { reply, maxFieldsAsked: 2 } });
    return { reply, shippingInfo: input.currentInfo || {}, source: 'rule', reason: 'ASK_CARGO_SERVICE', elapsedMs: Date.now() - started, trace };
  }
  if (selectedNow && !prior?.service && !hasCargoDetails(message)) {
    const reply = ruleReply(service, fields);
    drafts.set(id, { service, fields });
    trace.push({ step: 'rule_service_selection', status: 'ok', detail: { service, reply } });
    trace.push({ step: 'rule_reply', status: 'ok', detail: { service, missingFields: missingKeys(service, fields), reply, maxFieldsAsked: 2 } });
    const old = input.currentInfo || {};
    return { reply, shippingInfo: { ...old, mainVertical: 'chuyen_hang', subVertical: service, serviceDraft: { ...(old.serviceDraft || {}), fields, ready: false, missing: missingKeys(service, fields) } }, source: 'rule', reason: 'CARGO_SERVICE_SELECTED', elapsedMs: Date.now() - started, trace };
  }

  let qwenChanged = false, qwenFailed = false;
  const history = Array.isArray(input.history) ? input.history.slice(-5).map((h) => ({ role: String(h.role || 'user'), content: String(h.content || '').slice(0, 2000) })) : [];
  try {
    const requestInput = { latestMessage: message, history, selectedService: service, currentFields: fields };
    trace.push({ step: 'qwen_prompt', status: 'ok', detail: { model: 'Qwen/Qwen3-0.6B', systemPrompt, input: requestInput } });
    const generated = await callPassengerQwen(systemPrompt, requestInput, 256);
    const parsed = parsePassengerQwenJson(generated.text);
    if (!parsed || typeof parsed.fields !== 'object' || !parsed.fields || Array.isArray(parsed.fields)) throw new Error('QWEN_RESPONSE_SCHEMA');
    service = service || (parsed.service === 'express' || parsed.service === 'truck' ? parsed.service : null);
    trace.push({ step: 'qwen_generate', status: 'ok', detail: { model: generated.model, elapsedMs: generated.elapsedMs, rawOutput: generated.text, parsedJSON: parsed } });
    if (service) {
      const normalizedFields = normalizeCargoFields(parsed.fields);
      trace.push({ step: 'rule_map_fields', status: 'ok', detail: { qwenKeys: Object.keys(parsed.fields), canonicalKeys: Object.keys(normalizedFields) } });
      const merged = merge(fields, normalizedFields, message);
      Object.assign(fields, merged.fields);
      qwenChanged = merged.accepted.some((key) => fields[key] !== null && fields[key] !== undefined);
      trace.push({ step: 'rule_validate_fields', status: merged.forcedNull.length ? 'info' : 'ok', detail: { accepted: merged.accepted, forcedNull: merged.forcedNull } });
    }
  } catch (error) {
    qwenFailed = true;
    trace.push({ step: 'qwen_generate', status: 'error', detail: { model: 'Qwen/Qwen3-0.6B', error: error instanceof Error ? error.message : String(error) } });
  }

  let geminiCalled = false;
  if (service && !qwenChanged) {
    geminiCalled = true;
    trace.push({ step: 'gemini_fallback_trigger', status: 'ok', detail: { reason: qwenFailed ? 'QWEN_FAILED' : 'QWEN_NO_NEW_FIELDS' } });
    try {
      const result = await extractGemini(message, history, service, fields);
      service = service || result.service;
      const normalizedFields = normalizeCargoFields(result.fields);
      const merged = merge(fields, normalizedFields, message);
      Object.assign(fields, merged.fields);
      trace.push({ step: 'gemini_extract', status: 'ok', detail: { ...result.detail, extractedFields: result.fields, accepted: merged.accepted, forcedNull: merged.forcedNull } });
    } catch (error) {
      const providerError = error instanceof ChainError ? error.detail.error : undefined;
      trace.push({ step: 'gemini_extract', status: 'error', detail: {
        code: error instanceof ChainError ? error.code : 'GEMINI_ERROR',
        error: providerError || (error instanceof Error ? error.message : String(error)),
      } });
    }
  }

  if (service) drafts.set(id, { service, fields });
  const reply = ruleReply(service, fields);
  const missing = missingKeys(service, fields);
  const source = 'rule' as const;
  trace.push({ step: 'rule_reply', status: 'ok', detail: { service, missingFields: missing, reply, maxFieldsAsked: 2 } });
  const old = input.currentInfo || {};
  const cargoItems = Array.isArray(fields.items) ? fields.items : [];
  const shippingInfo = {
    ...old,
    mainVertical: 'chuyen_hang', subVertical: service || undefined,
    serviceDraft: { ...(old.serviceDraft || {}), fields, ready: missing.length === 0, missing: missing.map((key) => fieldLabels[key] || key) },
    sender: { ...(old.sender || {}), name: fields.contactName ?? old.sender?.name, phone: fields.contactPhone ?? old.sender?.phone, address: fields.pickup ?? old.sender?.address },
    receiver: { ...(old.receiver || {}), address: fields.destination ?? old.receiver?.address },
    cargo: { ...(old.cargo || {}), name: cargoItems.map((item: any) => `${item.name} (${item.quantity})`).join(', ') || fields.cargo || old.cargo?.name, items: cargoItems },
    deliveryTime: fields.time ?? old.deliveryTime,
    completionRate: requiredKeys(service).length ? Math.round((requiredKeys(service).length - missing.length) / requiredKeys(service).length * 100) : 0,
    missingFields: missing, missingKeys: missing, isComplete: false, isConfirmed: false,
  };
  const reason = !service ? 'CARGO_SERVICE_UNRESOLVED' : geminiCalled ? 'GEMINI_FALLBACK_RULE_REPLY' : 'QWEN_EXTRACTED_RULE_REPLY';
  return { reply, shippingInfo, source, reason, elapsedMs: Date.now() - started, trace };
}
