import { validateRideBooking } from './flows/ride/validate';
import { validateRentalBooking } from './flows/rental/validate';
import type { PassengerBooking, RideBooking, RentalBooking } from './types';
import { matchPassengerPartner, readMockOpsProfile } from './partnerMatcher';
import { callPassengerQwen, parsePassengerQwenJson } from './qwen-client';
import { cleanCustomerName, cleanVietnamesePhone, isExplicitFieldClear } from '../common/field-validation';
import { callGemini, Type } from '../../src/chatbot/services/gemini-client';
import { ChainError } from '../../src/chatbot/chains/trace';

export interface PassengerAgentTurnInput {
  event: 'message' | 'booking_ready';
  message?: string;
  booking?: PassengerBooking;
  experimentId?: string;
  history?: Array<{ role: string; content: string }>;
}
export interface PassengerAgentTraceStep { step: string; status: 'ok' | 'skip' | 'error' | 'info'; detail?: unknown }
export interface PassengerAgentTurnResult {
  reply: string;
  handover: boolean;
  source?: 'rule' | 'qwen' | 'gemini' | 'error';
  reason?: string;
  elapsedMs?: number;
  bookingDraft?: { flow: 'ride' | 'rental' | null; fields: Record<string, unknown>; missingFields: string[] };
  opsProfile?: Record<string, unknown>;
  partner?: Awaited<ReturnType<typeof matchPassengerPartner>>['partner'];
  retrieval?: Awaited<ReturnType<typeof matchPassengerPartner>>['retrieval'];
  trace: PassengerAgentTraceStep[];
}
const opsRequestPattern = /(?:gặp|nói chuyện với|gọi|chuyển(?:\s*(?:cho|sang))?|cần)\s*(?:ops|nhân viên|tư vấn viên|người thật|điều phối)|\bops\b/i;
const greetingPattern = /^(?:chào(?: bạn| em| anh| chị)?|xin chào|hi|hello|alo|dạ|vâng|chào bạn)[.!\s]*$/iu;
type Flow = 'ride' | 'rental' | null;
type Draft = { flow: Flow; fields: Record<string, unknown> };
const drafts = new Map<string, Draft>();
const norm = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/đ/gu, 'd').trim();

function explicitFlow(text: string): Flow {
  const t = norm(text);
  if (/\bride\b/u.test(t) || /(?:dat(?: xe)? theo chuyen|xe theo chuyen|theo chuyen|di mot chuyen|mot chieu|(?:1|mot) chuyen(?: thoi| nhe)?)/u.test(t)) return 'ride';
  if (/\brental\b/u.test(t) || /(?:thue xe? theo ngay|thue xe? theo lich trinh|thue theo lich trinh|lich trinh|thue xe nhieu ngay|thue xe tu lai)/u.test(t)) return 'rental';
  return null;
}
function fieldList(flow: Flow) {
  return flow === 'rental'
    ? ['customerName','customerPhone','pickupAddress','destinationAddress','itinerary','startsAt','endsAt','driverOption','passengerCount','notes']
    : ['customerName','customerPhone','pickupAddress','destinationAddress','pickupAt','passengerCount','isRoundTrip','notes'];
}
function cleanField(key: string, value: unknown): unknown {
  if (value === null || value === undefined || value === '') return undefined;
  if (key === 'customerName') return cleanCustomerName(typeof value === 'string' ? value : String(value)) || null;
  if (key === 'customerPhone') return cleanVietnamesePhone(typeof value === 'string' ? value : null) || null;
  if (key === 'passengerCount') {
    const n = Number(String(value).replace(/[^0-9]/gu, ''));
    return Number.isInteger(n) && n > 0 && n <= 100 ? n : undefined;
  }
  if (key === 'isRoundTrip') {
    if (typeof value === 'boolean') return value;
    const t = norm(String(value)).replace(/[_-]+/gu, ' ');
    if (/^(co|khu hoi|co khu hoi)$/u.test(t)) return true;
    if (/^(khong|mot chieu)$/u.test(t)) return false;
    return undefined;
  }
  if (key === 'driverOption') {
    const t = norm(String(value)).replace(/[_-]+/gu, ' ');
    if (/(tu lai|self drive|khong tai xe)/u.test(t)) return 'self_drive';
    if (/(tai xe|co tai xe|with driver)/u.test(t)) return 'with_driver';
    return undefined;
  }
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text && text.length <= 500 ? text : undefined;
}
function missingFields(flow: Flow, fields: Record<string, unknown>): string[] {
  if (!flow) return [];
  const required = flow === 'ride'
    ? [['customerName','Tên khách'],['customerPhone','Số điện thoại'],['pickupAddress','Điểm đón'],['destinationAddress','Điểm đến'],['pickupAt','Ngày giờ đón'],['passengerCount','Số hành khách']]
    : [['customerName','Tên khách'],['customerPhone','Số điện thoại'],['pickupAddress','Điểm đón'],['destinationAddress','Điểm đến chính'],['startsAt','Thời gian bắt đầu'],['endsAt','Thời gian kết thúc'],['driverOption','Tùy chọn tài xế'],['passengerCount','Số hành khách']];
  return required.filter(([key]) => fields[key] === undefined || fields[key] === null || fields[key] === '').map(([, label]) => label);
}
const QUESTION_VARIANTS: Record<string, string[]> = {
  customerName: ['Anh/chị cho em xin tên người đặt xe được không ạ?', 'Em xin tên để ghi vào yêu cầu đặt xe nhé, anh/chị.', 'Mình cho em xin tên người liên hệ đặt xe ạ?'],
  customerPhone: ['Anh/chị cho em xin số điện thoại liên hệ nhé?', 'Em cần số điện thoại để ghi nhận yêu cầu, anh/chị gửi giúp em ạ.', 'Mình để lại số điện thoại liên hệ cho em nhé?'],
  pickupAddress: ['Anh/chị muốn đón xe ở đâu ạ?', 'Mình gửi em địa chỉ điểm đón nhé?', 'Xe cần đón anh/chị tại địa chỉ nào ạ?'],
  destinationAddress: ['Anh/chị muốn đi đến đâu ạ?', 'Mình cho em xin điểm đến nhé?', 'Điểm đến của chuyến xe là ở đâu ạ?'],
  pickupAt: ['Anh/chị dự kiến đi vào ngày, giờ nào ạ?', 'Mình muốn xe đón lúc nào ạ?', 'Cho em xin thời gian khởi hành mong muốn nhé?'],
  passengerCount: ['Chuyến đi có bao nhiêu hành khách ạ?', 'Mình đi mấy người để em ghi nhận nhé?', 'Anh/chị cho em xin số lượng hành khách ạ?'],
  itinerary: ['Anh/chị dự kiến đi qua những địa điểm nào ạ?', 'Mình cho em xin lịch trình các điểm cần đi nhé?', 'Các điểm dừng trong lịch trình của anh/chị là những đâu ạ?'],
  startsAt: ['Anh/chị muốn bắt đầu thuê xe vào thời gian nào ạ?', 'Mình dự kiến khởi hành ngày, giờ nào ạ?', 'Cho em xin thời điểm bắt đầu lịch trình nhé?'],
  endsAt: ['Anh/chị dự kiến kết thúc lịch trình lúc nào ạ?', 'Mình muốn thuê xe đến ngày, giờ nào ạ?', 'Cho em xin thời gian kết thúc hoặc trả xe nhé?'],
  driverOption: ['Anh/chị muốn thuê xe có tài xế hay tự lái ạ?', 'Mình chọn xe có tài xế hay tự lái nhé?', 'Em xin biết anh/chị cần tài xế hay sẽ tự lái ạ?'],
  isRoundTrip: ['Anh/chị có cần xe chiều về không ạ?', 'Mình muốn đi một chiều hay khứ hồi ạ?', 'Chuyến này có cần đặt cả chiều về không ạ?'],
  notes: ['Anh/chị có yêu cầu nào khác cho chuyến đi không ạ?', 'Mình có lưu ý gì thêm để em ghi nhận không ạ?', 'Anh/chị muốn bổ sung ghi chú nào cho chuyến xe không ạ?'],
};
const QUESTION_PAIRS: Record<string, string[]> = {
  'customerName+customerPhone': ['Anh/chị cho em xin tên người đặt xe và số điện thoại liên hệ nhé?', 'Mình gửi em tên cùng số điện thoại để em ghi nhận chuyến ạ?', 'Em xin tên người liên hệ và số điện thoại của anh/chị nhé?'],
  'pickupAddress+destinationAddress': ['Anh/chị cho em xin điểm đón và điểm đến nhé?', 'Mình muốn xe đón ở đâu và đi đến đâu ạ?', 'Em xin địa chỉ đón cùng điểm đến của chuyến đi ạ?'],
  'pickupAt+passengerCount': ['Anh/chị dự kiến đi lúc nào và có bao nhiêu hành khách ạ?', 'Mình cho em xin thời gian khởi hành cùng số người đi nhé?', 'Em xin ngày giờ đi và số lượng hành khách ạ?'],
  'startsAt+endsAt': ['Anh/chị muốn bắt đầu và kết thúc lịch trình vào thời gian nào ạ?', 'Mình dự kiến thuê xe từ lúc nào đến lúc nào nhé?', 'Em xin thời điểm bắt đầu và kết thúc thuê xe ạ?'],
};
function ruleReply(flow: Flow, fields: Record<string, unknown>): string {
  if (!flow) return initialChoiceReply();
  const requiredKeys = flow === 'ride'
    ? ['customerName', 'customerPhone', 'pickupAddress', 'destinationAddress', 'pickupAt', 'passengerCount']
    : ['customerName', 'customerPhone', 'pickupAddress', 'destinationAddress', 'startsAt', 'endsAt', 'driverOption', 'passengerCount'];
  const missing = requiredKeys.filter((key) => fields[key] === undefined || fields[key] === null || fields[key] === '');
  if (!missing.length) return 'Dạ, em đã ghi nhận đủ thông tin chuyến đi. Em đang kiểm tra hồ sơ để ghép đối tác thử nghiệm ạ.';
  const first = missing[0];
  const second = missing[1];
  const paired: Record<string, string[]> = {
    customerName: ['customerPhone'],
    pickupAddress: ['destinationAddress'],
    pickupAt: ['passengerCount'],
    startsAt: ['endsAt'],
  };
  const keys = second && (paired[first] || []).includes(second) ? [first, second] : [first];
  const pair = keys.length === 2 ? QUESTION_PAIRS[`${keys[0]}+${keys[1]}`] : undefined;
  if (pair) return pair[Math.floor(Math.random() * pair.length)];
  return keys.map((key) => {
    const options = QUESTION_VARIANTS[key] || [`Anh/chị cho em xin ${key} nhé?`];
    return options[Math.floor(Math.random() * options.length)];
  }).join(' ');
}
function mergeFields(flow: Flow, target: Record<string, unknown>, extracted: Record<string, unknown>, message: string) {
  const fields = { ...target };
  const changed: string[] = [];
  const rejected: string[] = [];
  for (const key of fieldList(flow)) {
    if (!(key in extracted)) continue;
    const raw = extracted[key];
    if ((raw === null || raw === '') && isExplicitFieldClear(message, key)) {
      if (fields[key] !== null) { fields[key] = null; changed.push(key); }
      continue;
    }
    if (raw === null || raw === undefined || raw === '') continue;
    const value = cleanField(key, raw);
    if (value === null) { fields[key] = null; rejected.push(key); continue; }
    if (value === undefined) { rejected.push(key); continue; }
    if (JSON.stringify(fields[key]) !== JSON.stringify(value)) { fields[key] = value; changed.push(key); }
  }
  return { fields, changed, rejected };
}
function normalizeExtractedFields(flow: Flow, extracted: Record<string, unknown>) {
  const aliases: Record<string, string> = {
    name: 'customerName', fullname: 'customerName', customer: 'customerName', customername: 'customerName', contactname: 'customerName', bookername: 'customerName', passengername: 'customerName',
    phone: 'customerPhone', mobile: 'customerPhone', telephone: 'customerPhone', tel: 'customerPhone', phonenumber: 'customerPhone', customerphone: 'customerPhone', contactphone: 'customerPhone',
    pickup: 'pickupAddress', pickupaddress: 'pickupAddress', pickuplocation: 'pickupAddress', origin: 'pickupAddress', from: 'pickupAddress', fromaddress: 'pickupAddress', startlocation: 'pickupAddress',
    destination: 'destinationAddress', dest: 'destinationAddress', destinationaddress: 'destinationAddress', dropoff: 'destinationAddress', dropoffaddress: 'destinationAddress', to: 'destinationAddress', toaddress: 'destinationAddress', arrival: 'destinationAddress', endlocation: 'destinationAddress',
    departure: flow === 'ride' ? 'pickupAt' : 'startsAt', departuretime: flow === 'ride' ? 'pickupAt' : 'startsAt', pickupat: 'pickupAt', pickuptime: 'pickupAt', pickupdatetime: 'pickupAt', pickupdate: 'pickupAt',
    time: flow === 'ride' ? 'pickupAt' : 'startsAt', datetime: flow === 'ride' ? 'pickupAt' : 'startsAt', date: flow === 'ride' ? 'pickupAt' : 'startsAt',
    passengers: 'passengerCount', people: 'passengerCount', pax: 'passengerCount', guestcount: 'passengerCount', passengercount: 'passengerCount',
    roundtrip: 'isRoundTrip', isroundtrip: 'isRoundTrip', driver: 'driverOption', driveroption: 'driverOption',
    route: 'itinerary', stops: 'itinerary', destinations: 'itinerary', itinerary: 'itinerary', start: 'startsAt', startdate: 'startsAt', starttime: 'startsAt', rentalstart: 'startsAt', startsat: 'startsAt',
    end: 'endsAt', endat: 'endsAt', enddate: 'endsAt', endtime: 'endsAt', rentalend: 'endsAt', endsat: 'endsAt', startat: 'startsAt', note: 'notes', comments: 'notes', requests: 'notes',
  };
  const keyOf = (key: string) => key.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/đ/gu, 'd').replace(/[^a-z0-9]/gu, '');
  const toValue = (key: string, value: unknown): unknown => {
    if (Array.isArray(value) && key === 'itinerary') return value.map((item) => typeof item === 'string' ? item : item && typeof item === 'object' ? String((item as Record<string, unknown>).name || (item as Record<string, unknown>).address || '') : '').filter(Boolean).join('\n');
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (key === 'pickupAddress' || key === 'destinationAddress') return record.address ?? record.value ?? record.text;
      if (key === 'pickupAt' || key === 'startsAt' || key === 'endsAt') return [record.date, record.time].filter(Boolean).join(' ') || record.value || record.text;
      if (key === 'itinerary') {
        const stops = record.stops ?? record.destinations ?? record.points ?? record.route;
        if (Array.isArray(stops)) return stops.map((stop) => typeof stop === 'string' ? stop : stop && typeof stop === 'object' ? String((stop as Record<string, unknown>).name || (stop as Record<string, unknown>).address || '') : '').filter(Boolean).join('\n');
      }
    }
    if (typeof value === 'number' && ['pickupAddress', 'destinationAddress', 'pickupAt', 'startsAt', 'endsAt', 'itinerary', 'notes'].includes(key)) return String(value);
    return value;
  };
  const normalized: Record<string, unknown> = {};
  const setIfEmpty = (key: string, value: unknown) => {
    if (!(key in normalized) || normalized[key] === undefined || normalized[key] === null || normalized[key] === '') normalized[key] = value;
  };
  for (const [key, value] of Object.entries(extracted)) {
    if (['customer', 'contact', 'booker', 'passenger'].includes(keyOf(key)) && value && typeof value === 'object' && !Array.isArray(value)) {
      const person = value as Record<string, unknown>;
      for (const [personKey, personValue] of Object.entries(person)) {
        const canonical = aliases[keyOf(personKey)];
        if (canonical === 'customerName' || canonical === 'customerPhone') setIfEmpty(canonical, personValue);
      }
      continue;
    }
    if (['route', 'trip', 'journey', 'schedule'].includes(keyOf(key)) && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
        const canonical = aliases[keyOf(nestedKey)] || nestedKey;
        setIfEmpty(canonical, toValue(canonical, nestedValue));
      }
      continue;
    }
    const canonical = aliases[keyOf(key)] || key;
    setIfEmpty(canonical, toValue(canonical, value));
  }
  // Canonical keys from the model take precedence over aliases regardless of key order.
  for (const key of fieldList(flow)) if (extracted[key] !== undefined && extracted[key] !== null && extracted[key] !== '') normalized[key] = toValue(key, extracted[key]);
  return normalized;
}
async function extractWithGemini(message: string, history: Array<{ role: string; content: string }>, flow: Flow, fields: Record<string, unknown>) {
  const keys = fieldList(flow);
  const schema = { type: Type.OBJECT, required: ['fields'], properties: { fields: { type: Type.OBJECT, properties: Object.fromEntries(keys.map((key) => [key, { type: Type.STRING }])) } } };
  const system = `Bạn chỉ trích xuất các giá trị khách đã nói rõ trong tin nhắn mới nhất hoặc ngữ cảnh gần đây cho đặt xe ${flow}. Không viết câu trả lời cho khách. Không bịa. Chỉ trả JSON {"fields":{...}} và chỉ đưa vào fields các giá trị mới hoặc khách sửa/xóa. Khi khách yêu cầu xóa một trường, đặt trường đó thành null. Trường điện thoại phải giữ nguyên chuỗi số khách cung cấp; tên không được lấy đại từ xưng hô.`;
  const result = await callGemini(system, { message, history: history.slice(-5), currentFields: fields }, schema);
  return { value: result.value?.fields && typeof result.value.fields === 'object' && !Array.isArray(result.value.fields) ? result.value.fields as Record<string, unknown> : {}, detail: result.detail };
}
function initialChoiceReply() {
  const replies = [
    'Dạ, anh/chị muốn đặt xe theo chuyến (Ride) hay thuê xe theo lịch trình/ngày (Rental) ạ?',
    'Mình cần xe đi một chuyến hay thuê xe theo lịch trình hoặc theo ngày ạ?',
    'Em hỗ trợ Ride theo chuyến và Rental theo lịch trình. Anh/chị đang cần loại nào ạ?',
  ];
  return replies[Math.floor(Math.random() * replies.length)];
}
function hasBookingDetails(text: string): boolean {
  return /(?:đón|điểm đón|điểm đến|địa chỉ|số điện thoại|sđt|bao nhiêu người|\d\s*(?:người|khách|hành khách)|lúc\s*\d|ngày\s*\d|ngày mai|hôm nay|từ.{2,}đến)/iu.test(text);
}
function isShortMessage(text: string): boolean {
  return greetingPattern.test(text) || /^(?:ok(?:ay)?|ừ|được|cảm ơn|thanks|vâng|dạ)[.!\s]*$/iu.test(text);
}
function schemaPrompt() {
  return 'Bạn chỉ làm nhiệm vụ trích xuất dữ liệu cho chatbot thử nghiệm chuyển người. Đọc tin nhắn khách, tối đa 5 lượt hội thoại gần nhất và hồ sơ hiện tại. Không viết câu trả lời. Chỉ trả JSON {"flow":"ride"|"rental"|null,"fields":{...}}. Dùng đúng các khóa chuẩn: customerName, customerPhone, pickupAddress, destinationAddress, itinerary, startsAt, endsAt, pickupAt, passengerCount, driverOption, isRoundTrip, notes; không rút gọn thành name/phone/pickup/to. Chỉ đưa vào fields những giá trị khách vừa nêu rõ hoặc sửa; không cần điền null cho trường không có thông tin. Nếu khách yêu cầu xóa trường, trả trường đó với giá trị null. Không bịa. Tên không được là đại từ xưng hô; điện thoại phải là số Việt Nam hợp lệ. Ride: thời gian đi vào pickupAt. Rental: thời gian bắt đầu/kết thúc lần lượt startsAt/endsAt. Chỉ chọn flow khi khách nói rõ theo chuyến hoặc thuê theo lịch trình/ngày.';
}
function flowSelectionPrompt() {
  return 'Bạn đang phân loại nhu cầu chuyển người của khách trong chatbot thử nghiệm. Chỉ chọn một trong hai flow. RIDE là một chuyến xe từ điểm đón đến điểm đến tại thời gian cụ thể; bao gồm khách nói đi một chuyến, một chiều, khứ hồi, cần xe đưa từ A đến B. RENTAL là thuê xe theo khoảng thời gian/ngày hoặc lịch trình có thể gồm nhiều điểm dừng, khách nói thuê xe theo ngày, theo giờ, nhiều ngày, có tài xế hoặc tự lái. Cụm “một chuyến” hoặc “1 chuyến thôi” được hiểu là RIDE, trừ khi khách nói rõ thuê xe theo ngày/lịch trình. Dựa vào tin nhắn mới nhất và tối đa 5 lượt trước đó; không chọn dựa riêng vào lời chào. Nếu ý định vẫn không rõ, flow=null. Không viết câu trả lời cho khách. Nếu phân loại được flow, trích xuất luôn mọi thông tin khách đã cung cấp vào các field hợp lệ bên dưới; bỏ qua field chưa biết, không bịa. Tên phải là tên cụ thể, không phải đại từ; điện thoại chỉ lấy khi có số Việt Nam. Với Ride, thời gian vào pickupAt. Với Rental, thời gian bắt đầu/kết thúc vào startsAt/endsAt. Trả duy nhất JSON {"flow":"ride"|"rental"|null,"fields":{...}}. Các field: customerName, customerPhone, pickupAddress, destinationAddress, itinerary, startsAt, endsAt, pickupAt, passengerCount, driverOption, isRoundTrip, notes.';
}
function limitDrafts() {
  while (drafts.size > 100) drafts.delete(drafts.keys().next().value as string);
}

export async function runPassengerAgentTurn(input: PassengerAgentTurnInput): Promise<PassengerAgentTurnResult> {
  const message = String(input.message || '').trim();
  const trace: PassengerAgentTraceStep[] = [{ step: 'passenger_agent', status: 'ok', detail: { event: input.event, experimentId: input.experimentId } }];
  if (input.event === 'message' && opsRequestPattern.test(message)) {
    const opsProfile = await readMockOpsProfile();
    trace.push({ step: 'ops_handover', status: 'ok', detail: { opsId: opsProfile.id, mock: true } });
    return { reply: 'Em đã chuyển cuộc trò chuyện cho điều phối viên để hỗ trợ anh/chị trực tiếp. Anh/chị chờ em một chút nhé.', handover: true, source: 'rule', reason: 'OPS_HANDOVER', elapsedMs: 0, opsProfile, trace };
  }
  if (input.event === 'booking_ready' && input.booking) {
    const validation = input.booking.flow === 'ride' ? validateRideBooking(input.booking as RideBooking) : validateRentalBooking(input.booking as RentalBooking);
    if (!validation.isComplete) {
      const next = validation.missingFields[0] || 'thông tin còn thiếu';
      return { reply: 'Em chưa thể tìm đối tác vì còn thiếu ' + next + '. Anh/chị bổ sung giúp em nhé.', handover: false, source: 'rule', reason: 'BOOKING_INCOMPLETE', elapsedMs: 0, trace: [...trace, { step: 'booking_validation', status: 'skip', detail: { missingFields: validation.missingFields } }] };
    }
    const result = await matchPassengerPartner(input.booking);
    trace.push({ step: 'partner_match_function', status: result.partner ? 'ok' : 'skip', detail: result.retrieval });
    if (!result.partner) {
      const opsProfile = await readMockOpsProfile();
      return { reply: 'Chưa có đối tác giả lập đáp ứng số hành khách hoặc tùy chọn tài xế này. Em chuyển anh/chị sang điều phối viên để hỗ trợ tiếp nhé.', handover: true, source: 'rule', reason: 'NO_ELIGIBLE_PARTNER', elapsedMs: 0, opsProfile, retrieval: result.retrieval, trace: [...trace, { step: 'ops_handover', status: 'ok', detail: { reason: 'NO_ELIGIBLE_PARTNER', opsId: opsProfile.id } }] };
    }
    const partner = result.partner;
    return { reply: 'Em đã tìm được đối tác giả lập phù hợp: ' + partner.displayName + ', xe ' + partner.vehicle.make + ' ' + partner.vehicle.model + ', tối đa ' + partner.maxPassengers + ' hành khách. Chưa gửi yêu cầu thật.', handover: false, source: 'rule', reason: 'MOCK_PARTNER_MATCH', elapsedMs: 0, partner, retrieval: result.retrieval, trace };
  }

  const id = String(input.experimentId || 'default-passenger-experiment').slice(0, 120);
  const previous = drafts.get(id) || { flow: null, fields: {} };
  const selectedNow = explicitFlow(message);
  if (!previous.flow) trace.push({ step: 'rule_flow_selection', status: selectedNow ? 'ok' : 'skip', detail: selectedNow ? { input: message, selectedFlow: selectedNow } : { input: message, reason: 'FLOW_NOT_CLEAR_USE_QWEN' } });
  if (isShortMessage(message) && !(previous.flow || selectedNow)) {
    const flow = previous.flow || selectedNow;
    const reply = flow ? ruleReply(flow, previous.fields) : initialChoiceReply();
    trace.push({ step: 'rule_greeting_short', status: 'ok', detail: { selectedFlow: flow, stage: flow ? 'COLLECT_DETAILS' : 'SELECT_RIDE_OR_RENTAL', reply } });
    if (flow) drafts.set(id, { flow, fields: previous.fields });
    return { reply, handover: false, source: 'rule', reason: flow ? 'ASK_BOOKING_FIELD' : 'ASK_PASSENGER_FLOW', elapsedMs: 0, bookingDraft: { flow, fields: flow ? previous.fields : {}, missingFields: flow ? missingFields(flow, previous.fields) : [] }, trace };
  }
  if (selectedNow && !previous.flow && !hasBookingDetails(message)) {
    const fields: Record<string, unknown> = selectedNow === 'rental' ? { driverOption: 'with_driver' } : {};
    drafts.set(id, { flow: selectedNow, fields });
    const reply = ruleReply(selectedNow, fields);
    trace.push({ step: 'collect_booking_details', status: 'ok', detail: { stage: 'COLLECT_DETAILS', nextQuestion: reply } });
    return { reply, handover: false, source: 'rule', reason: 'FLOW_SELECTED_BY_RULE', elapsedMs: 0, bookingDraft: { flow: selectedNow, fields, missingFields: missingFields(selectedNow, fields) }, trace };
  }

  const context = Array.isArray(input.history)
    ? input.history.filter((item) => item && (item.role === 'user' || item.role === 'model')).slice(-5).map((item) => ({ role: item.role, content: String(item.content || '').slice(0, 2000) }))
    : [{ role: 'user', content: message }];
  const currentFlow = previous.flow || selectedNow;
  const isFlowClassification = !currentFlow;
  const system = isFlowClassification ? flowSelectionPrompt() : schemaPrompt();
  const requestInput = { latestMessage: message, history: context, selectedFlow: currentFlow, currentDraft: previous.fields };
  const started = Date.now();
  trace.push({ step: 'qwen_prompt', status: 'ok', detail: { model: 'Qwen/Qwen3-0.6B', task: isFlowClassification ? 'classify_ride_or_rental' : 'extract_booking_fields', systemPrompt: system, input: requestInput } });
  let flow: Flow = previous.flow || selectedNow;
  let fields: Record<string, unknown> = { ...(previous.flow === flow ? previous.fields : {}) };
  if (flow === 'rental' && (fields.driverOption === undefined || fields.driverOption === null)) fields.driverOption = 'with_driver';
  let qwenChanged = false;
  let qwenFailed = false;
  try {
    console.info('[Passenger Agent] Qwen inference started', { experimentId: id, model: 'Qwen/Qwen3-0.6B', maxNewTokens: 256 });
    const generated = await callPassengerQwen(system, requestInput, 256);
    console.info('[Passenger Agent] Qwen inference completed', { experimentId: id, elapsedMs: generated.elapsedMs, model: generated.model });
    const parsed = parsePassengerQwenJson(generated.text);
    trace.push({ step: 'qwen_generate', status: 'ok', detail: { model: generated.model, task: isFlowClassification ? 'classify_ride_or_rental' : 'extract_booking_fields', rawOutput: generated.text, parsedJSON: parsed, elapsedMs: generated.elapsedMs } });
    if (!parsed || typeof parsed.fields !== 'object' || !parsed.fields || Array.isArray(parsed.fields)) throw new Error('QWEN_RESPONSE_SCHEMA');

    // Do not let the model skip the explicit Ride/Rental choice.
    flow = flow || (parsed.flow === 'ride' || parsed.flow === 'rental' ? parsed.flow : null);
    if (flow === 'rental' && (fields.driverOption === undefined || fields.driverOption === null)) fields.driverOption = 'with_driver';
    if (isFlowClassification) trace.push({ step: 'qwen_flow_classifier', status: flow ? 'ok' : 'skip', detail: { selectedFlow: flow, unresolved: !flow } });
    if (flow) {
      const extractedFields = normalizeExtractedFields(flow, parsed.fields);
      trace.push({ step: 'rule_map_fields', status: 'ok', detail: { qwenKeys: Object.keys(parsed.fields), canonicalKeys: Object.keys(extractedFields) } });
      if (flow === 'ride' && !cleanField('pickupAt', extractedFields.pickupAt)) {
        extractedFields.pickupAt = extractedFields.startsAt || extractedFields.departureTime || extractedFields.departure || extractedFields.time;
      }
      const merged = mergeFields(flow, fields, extractedFields, message);
      fields = merged.fields;
      qwenChanged = merged.changed.some((key) => fields[key] !== null && fields[key] !== undefined);
      trace.push({ step: 'rule_validate_fields', status: merged.rejected.length ? 'info' : 'ok', detail: { acceptedOrCleared: merged.changed, forcedNull: merged.rejected } });
    }
  } catch (error) {
    qwenFailed = true;
    const messageText = error instanceof Error ? error.message : String(error);
    trace.push({ step: 'qwen_generate', status: 'error', detail: { model: 'Qwen/Qwen3-0.6B', endpoint: 'http://127.0.0.1:8765/generate', error: messageText } });
  }

  let geminiCalled = false;
  if (flow && !qwenChanged) {
    geminiCalled = true;
    trace.push({ step: 'gemini_fallback_trigger', status: 'ok', detail: { reason: qwenFailed ? 'QWEN_FAILED' : 'QWEN_NO_NEW_FIELDS' } });
    try {
      const extracted = await extractWithGemini(message, context, flow, fields);
      const normalizedFields = normalizeExtractedFields(flow, extracted.value);
      const merged = mergeFields(flow, fields, normalizedFields, message);
      fields = merged.fields;
      trace.push({ step: 'gemini_extract', status: 'ok', detail: { ...extracted.detail, extractedFields: extracted.value, canonicalFields: Object.keys(normalizedFields), acceptedOrCleared: merged.changed, forcedNull: merged.rejected } });
    } catch (error) {
      const providerError = error instanceof ChainError ? error.detail.error : undefined;
      trace.push({ step: 'gemini_extract', status: 'error', detail: {
        code: error instanceof ChainError ? error.code : 'GEMINI_ERROR',
        error: providerError || (error instanceof Error ? error.message : String(error)),
      } });
    }
  }

  if (flow) { drafts.set(id, { flow, fields }); limitDrafts(); }
  const missing = missingFields(flow, fields);
  const reply = ruleReply(flow, fields);
  trace.push({ step: 'rule_reply', status: 'ok', detail: { flow, missingFields: missing, reply, maxFieldsAsked: 2 } });
  trace.push({ step: 'passenger_booking_draft', status: 'ok', detail: { flow, fields, missingFields: missing } });
  const reason = !flow ? 'PASSENGER_FLOW_UNRESOLVED' : geminiCalled ? 'GEMINI_FALLBACK_RULE_REPLY' : 'QWEN_EXTRACTED_RULE_REPLY';
  return { reply, handover: false, source: 'rule', reason, elapsedMs: Date.now() - started, bookingDraft: { flow, fields, missingFields: missing }, trace };
}
