import { Type, type ModelCall, recentHistory } from './gemini-client';
import { SERVICE_LABELS, type SubVertical, type ServiceDraft } from '../../shared/service-menu';
import { baseInfo, includesSpan } from '../validation/field-check';
import { ChainError, errorDetail } from '../chains/trace';
import type { AITraceStep } from '../../shared/types';
import { extractWithQwen, isPriceQuestion, NO_QUOTE_API_REPLY } from './qwen-client';
import { callPassengerQwen, parsePassengerQwenJson } from '../../../chatbot/passenger-transport/qwen-client';

export type Field = { key: string; label: string; question: string; aliases: string[]; kind?: 'count' | 'phone' | 'text'; optional?: boolean };
export type BookingSetup = { service: Exclude<SubVertical, 'express'>; fields: Field[]; instructions: string; completion: string; flexible?: boolean };
const fold = (s: string) => s.toLocaleLowerCase('vi').normalize('NFC').replace(/\s+/gu, ' ').trim();
const digits = (s: string) => s.replace(/\D/gu, '');
function safeField(f: Field, value: unknown): string | undefined {
  if (f.kind === 'count' && typeof value === 'number' && Number.isInteger(value)) value = String(value);
  if (typeof value !== 'string' || !value.trim() || value.length > 500) return;
  const s = value.trim();
  if (f.kind === 'count' && !/^[1-9]\d{0,2}$/u.test(s)) return;
  if (f.kind === 'phone' && !/^(?:0\d{9}|\+84\d{9})$/u.test(s.replace(/[ .-]/gu, ''))) return;
  if (f.key.toLowerCase().includes('name') && (/\d/u.test(s) || /^(?:anh|chị|em|tôi|mình|bạn|khách|người đặt)$/iu.test(s))) return;
  return s;
}
function isGrounded(message: string, value: string, field: Field) {
  if (includesSpan(message, value)) return true;
  return field.kind === 'phone' && digits(message).includes(digits(value));
}
function isExplicitClear(message: string, field: Field) {
  const m = fold(message);
  const mentioned = [field.label, ...field.aliases, field.key].some((word) => word && m.includes(fold(word)));
  return mentioned && /(?:xóa|xoá|bỏ|gỡ|huỷ|hủy|không dùng|không lấy|để trống|xóa giúp|bỏ giúp)/iu.test(m);
}

function ruleExtractText(message: string, setup: BookingSetup, history: any[], existing: Record<string, string>): Record<string, string> {
  const patch: Record<string, string> = {};
  const put = (key: string, value?: string) => {
    const field = setup.fields.find((item) => item.key === key);
    const clean = value?.trim().replace(/^(?:địa chỉ|địa điểm)\s+/iu, '').replace(/\s+(?:nhé|ạ|giúp em|em nhé)$/iu, '').replace(/[,.!?;\s]+$/u, '').trim();
    if (field && clean) {
      const safe = safeField(field, clean);
      if (safe && isGrounded(message, safe, field)) patch[key] = safe;
    }
  };
  const captures: Array<[string, RegExp]> = [
    ['pickupAddress', /(?:đón(?:\s+(?:mình|tôi|anh|chị|em|chúng tôi|chúng mình))?\s+(?:tại|ở)|đón\s+(?:tại|ở)|điểm đón\s*(?:là|:)?|lấy hàng\s+(?:tại|ở))\s+(.+?)(?=\s+(?:rồi|sau đó|đến điểm|đi đến|đưa đến|lúc|vào lúc|ngày mai|hôm nay|ngày kia|cho\s+\d+\s+người)\b|$)/iu],
    ['destinationAddress', /(?:điểm đến\s*(?:là|:)?|đi\s+(?:đến|tới)|đưa\s+(?:mình|tôi|anh|chị)?\s*(?:đến|tới))\s+(.+?)(?=\s+(?:lúc|vào lúc|ngày mai|hôm nay|ngày kia|cho\s+\d+\s+người)\b|$)/iu],
    ['pickupAt', /((?:hôm nay|ngày mai|ngày kia|mốt|thứ\s+(?:hai|ba|tư|năm|sáu|bảy|chủ nhật)|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s*(?:lúc|vào lúc)?\s*\d{1,2}(?::\d{2}|\s*(?:giờ|h|g))?(?:\s*(?:sáng|chiều|tối))?)/iu],
    ['time', /((?:hôm nay|ngày mai|ngày kia|mốt|thứ\s+(?:hai|ba|tư|năm|sáu|bảy|chủ nhật)|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s*(?:lúc|vào lúc)?\s*\d{1,2}(?::\d{2}|\s*(?:giờ|h|g))?(?:\s*(?:sáng|chiều|tối))?)/iu],
    ['startsAt', /((?:hôm nay|ngày mai|ngày kia|mốt|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s*(?:lúc|vào lúc)?\s*\d{1,2}(?::\d{2}|\s*(?:giờ|h|g))?(?:\s*(?:sáng|chiều|tối))?)/iu],
    ['endsAt', /(?:đến|tới|kết thúc|trả xe)\s+((?:hôm nay|ngày mai|ngày kia|mốt|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s*(?:lúc|vào lúc)?\s*\d{1,2}(?::\d{2}|\s*(?:giờ|h|g))?(?:\s*(?:sáng|chiều|tối))?)/iu],
    ['passengerCount', /(?:cho|đi|có|gồm)\s+([1-9]\d{0,2})\s*(?:người|khách|hành khách)\b/iu],
    ['guests', /(?:cho|đi|có|gồm)\s+([1-9]\d{0,2})\s*(?:người|khách|hành khách)\b/iu],
    ['customerPhone', /((?:\+84|0)\d(?:[\s.-]?\d){8,9})\b/u],
    ['customerName', /(?:tên (?:của )?(?:tôi|mình|anh|chị|em)\s+(?:là|:)|tôi tên là|mình tên là|người liên hệ là)\s*([^,.;\n]{2,80})/iu],
    ['cargo', /(?:hàng(?: hóa)?|đồ đạc|mặt hàng)(?:\s+(?:là|gồm|gồm có))?\s*[:：]?\s+(.+?)(?=\s+(?:lấy tại|giao tại|ngày mai|hôm nay|vào ngày)\b|$)/iu],
    ['truckType', /(?:loại xe tải|xe tải cần|cần xe tải)\s*(?:là|:)?\s*([^,.;\n]+)/iu],
    ['itinerary', /(?:lịch trình|các điểm đi|đi qua)\s*(?:là|gồm|:)?\s*([^.;\n]+)/iu],
    ['budget', /(?:ngân sách|chi phí dự kiến)\s*(?:là|khoảng|:)?\s*([\d., ]+\s*(?:triệu|tr|nghìn|k|đ|đồng|vnđ|vnd)?)/iu],
    ['weightDimensions', /(?:cân nặng|khối lượng|kích thước|thể tích)\s*(?:là|khoảng|:)?\s*([^,.;\n]+)/iu],
  ];
  for (const [key, pattern] of captures) {
    const match = message.match(pattern);
    if (!match) continue;
    const field = setup.fields.find((item) => item.key === key);
    const captured = field?.kind === 'count' ? match[1] : match[1];
    put(key, captured);
  }
  // A short bare answer is assigned only to a field the bot actually asked about in the previous turn.
  if (!Object.keys(patch).length && !/[?？]/u.test(message) && !/(?:là gì|bao nhiêu|như thế nào|được không|có không)/iu.test(message)) {
    const assistantMessages = history.filter((item) => ['model', 'assistant', 'bot'].includes(item.role || item.sender));
    const lastQuestion = String(assistantMessages.at(-1)?.content || assistantMessages.at(-1)?.text || '');
    const candidates = setup.fields.filter((field) => !existing[field.key] && [...(questionVariants[field.key] || []), field.question].some((question) => question && lastQuestion.includes(question)));
    const single = message.trim().match(/^(?:dạ[, ]*)?(.{2,180})[.!]?$/iu)?.[1];
    if (single && candidates.length) {
      const typed = candidates.filter((field) => field.kind === 'phone' && /(?:\+84|0)\d(?:[\s.-]?\d){8,9}/u.test(single) || field.kind === 'count' && /^[1-9]\d{0,2}(?:\s*(?:người|khách|hành khách))?$/iu.test(single));
      const target = typed.length === 1 ? typed[0] : candidates.sort((a, b) => lastQuestion.indexOf([...(questionVariants[a.key] || []), a.question].find((q) => q && lastQuestion.includes(q)) || '') - lastQuestion.indexOf([...(questionVariants[b.key] || []), b.question].find((q) => q && lastQuestion.includes(q)) || ''))[0];
      if (target.kind === 'count') put(target.key, single.match(/^([1-9]\d{0,2})/u)?.[1]);
      else put(target.key, single);
    }
  }
  return patch;
}

const questionVariants: Record<string, string[]> = {
  customerName: ['Anh/chị cho em xin tên người liên hệ đặt dịch vụ được không ạ?', 'Em xin tên người đặt để ghi nhận yêu cầu nhé ạ?', 'Mình cho em xin tên người liên hệ ạ?'],
  customerPhone: ['Anh/chị cho em xin số điện thoại liên hệ ạ?', 'Mình để lại số điện thoại để nhân viên liên hệ nhé ạ?', 'Em xin số điện thoại của anh/chị ạ?'],
  pickupAddress: ['Anh/chị muốn đón/lấy tại địa chỉ nào ạ?', 'Mình gửi em điểm đón hoặc địa chỉ lấy hàng nhé?', 'Điểm đón/lấy cụ thể ở đâu ạ?'],
  destinationAddress: ['Anh/chị muốn đến/giao hàng tại đâu ạ?', 'Mình cho em xin địa chỉ điểm đến nhé?', 'Điểm đến hoặc nơi giao hàng là ở đâu ạ?'],
  pickupAt: ['Anh/chị dự kiến khởi hành lúc nào ạ?', 'Mình muốn được đón vào ngày giờ nào ạ?', 'Thời gian khởi hành dự kiến là khi nào ạ?'],
  passengerCount: ['Chuyến đi có bao nhiêu hành khách ạ?', 'Đoàn mình có bao nhiêu người ạ?', 'Mình cho em xin số hành khách nhé ạ?'],
  itinerary: ['Anh/chị dự kiến đi qua những địa điểm nào ạ?', 'Mình cho em xin lịch trình hoặc các điểm muốn ghé nhé?', 'Lịch trình thuê xe của mình gồm những điểm nào ạ?'],
  startsAt: ['Anh/chị muốn bắt đầu vào ngày giờ nào ạ?', 'Thời gian bắt đầu dự kiến là khi nào ạ?', 'Mình muốn khởi hành ngày nào ạ?'],
  endsAt: ['Anh/chị dự kiến kết thúc hoặc trả xe lúc nào ạ?', 'Mình thuê xe đến ngày giờ nào ạ?', 'Thời gian kết thúc lịch trình dự kiến là khi nào ạ?'],
  cargo: ['Anh/chị cần chuyển những hàng hóa/đồ đạc nào ạ?', 'Mình mô tả giúp em loại hàng và số lượng nhé?', 'Anh/chị cần vận chuyển mặt hàng gì ạ?'],
  time: ['Anh/chị muốn vận chuyển vào ngày giờ nào ạ?', 'Mình dự kiến chuyển hàng khi nào ạ?', 'Thời gian lấy/giao mong muốn là lúc nào ạ?'],
  truckType: ['Anh/chị cần loại xe tải nào ạ?', 'Mình dự kiến cần xe tải loại nào ạ?', 'Anh/chị có yêu cầu cụ thể về loại xe tải không ạ?'],
  destination: ['Anh/chị đang quan tâm tour hoặc khách sạn ở đâu ạ?', 'Mình muốn đi du lịch tại địa điểm nào ạ?', 'Điểm đến dự kiến của mình là ở đâu ạ?'],
  travelDates: ['Anh/chị dự kiến đi vào thời gian nào ạ?', 'Mình muốn đi ngày nào hoặc khoảng thời gian nào ạ?', 'Thời gian dự kiến cho chuyến du lịch là khi nào ạ?'],
  guests: ['Đoàn mình dự kiến có bao nhiêu người ạ?', 'Anh/chị cho em xin số khách dự kiến nhé?', 'Mình dự kiến đặt cho bao nhiêu khách ạ?'],
  budget: ['Anh/chị có ngân sách dự kiến cho chuyến đi không ạ?', 'Mình dự trù ngân sách khoảng bao nhiêu ạ?', 'Anh/chị muốn tham khảo trong mức ngân sách nào ạ?'],
  preference: ['Anh/chị quan tâm tour trọn gói hay khách sạn ạ?', 'Mình muốn tìm tour hay chủ yếu cần khách sạn ạ?', 'Anh/chị mô tả thêm nhu cầu du lịch giúp em nhé?'],
};
function ruleQuestions(fields: Field[], history: any[]) {
  const shuffled = [...fields];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled.slice(0, 2).map((field) => {
    const options = questionVariants[field.key] || [field.question, field.question, field.question];
    const previous = history.filter((item) => ['model', 'assistant', 'bot'].includes(item.role || item.sender)).slice(-4).map((item) => fold(String(item.content || item.text || '')));
    const available = options.filter((option) => !previous.some((prior) => prior.includes(fold(option))));
    const pool = available.length ? available : options;
    return pool[Math.floor(Math.random() * pool.length)];
  }).join(' ');
}
const meaningfulMessage = (message: string) => message.trim().length >= 4 && !/^(?:chào(?: bạn| em| anh| chị)?|xin chào|hi|hello|alo|ok|okay|vâng|dạ|ừ|ừm|cảm ơn)[.! ]*$/iu.test(message.trim());
const OPS_SUPPORT_ON_AI_CREDITS_EXHAUSTED = 'Dạ, nội dung này em chưa xử lý tự động được; anh/chị vui lòng nhờ DCE Ops hỗ trợ thêm ạ.';
function isGeminiCreditsExhausted(error: unknown) {
  const detail = error instanceof ChainError ? error.detail : errorDetail(error);
  const text = JSON.stringify(detail);
  return /(?:\b402\b|RESOURCE_EXHAUSTED|prepayment.{0,50}credits?.{0,30}(?:deplet|exhaust)|(?:credits?|quota).{0,40}(?:deplet|exhaust|exceed)|(?:deplet|exhaust).{0,40}(?:credits?|quota))/iu.test(text);
}

type ConfirmationDecision = 'confirm' | 'reject' | 'unclear';
function confirmationText(message: string) {
  return message.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/đ/gu, 'd').replace(/[.!?,;:]+/gu, ' ').replace(/\s+/gu, ' ').trim();
}
function isCorrectionMessage(message: string) {
  return /(?:sua|chinh|doi|thay|nham|sai|cap nhat|khong phai|dia chi .*?(?:la|la phai)|so dien thoai .*?(?:la|la phai))/u.test(confirmationText(message));
}
function ruleConfirmation(message: string): ConfirmationDecision {
  const text = confirmationText(message);
  if (/^(?:khong|chua|sai|khong dung|khong chinh xac|khong xac nhan|chua dung|chua chinh xac)(?:\s|$)/u.test(text)) return 'reject';
  if (/^(?:(?:da|vang|uh|um)\s+)?(?:dung(?: roi)?|chinh xac|chuan(?: roi)?|xac nhan|em xac nhan|anh xac nhan|chi xac nhan|dong y|ok|oke|okay|yes|confirm)(?:\s+(?:nhe|a|em|roi))?$/u.test(text)) return 'confirm';
  return 'unclear';
}
async function qwenConfirmation(message: string, history: any[], setup: BookingSetup, fields: Record<string, string>, timeoutMs = 180_000) {
  const system = `Khách vừa xem bản tóm tắt thông tin ${SERVICE_LABELS[setup.service]}. Chỉ phân loại tin nhắn mới nhất là khách xác nhận bản tóm tắt (confirm), từ chối/chưa đúng (reject), hay chưa rõ (unclear). Nếu khách hỏi thêm hoặc nói nội dung không thể hiện rõ đồng ý/từ chối thì chọn unclear. Không trích xuất trường, không trả lời khách. Chỉ trả JSON {"decision":"confirm|reject|unclear"}.`;
  const result = await callPassengerQwen(system, {
    latestMessage: message,
    recentHistory: history.slice(-4).map((item) => ({ role: item.role || item.sender, content: item.content || item.text || '' })),
    confirmedFields: fields,
  }, 80, timeoutMs);
  const parsed = parsePassengerQwenJson(result.text);
  const decision = parsed?.decision;
  if (!['confirm', 'reject', 'unclear'].includes(decision)) throw new Error('QWEN_CONFIRMATION_SCHEMA');
  return { decision: decision as ConfirmationDecision, elapsedMs: result.elapsedMs, model: result.model, rawOutput: result.text };
}

function confirmationSummary(setup: BookingSetup, fields: Record<string, string>) {
  const rows = setup.fields.flatMap((field) => {
    const value = fields[field.key];
    if (!value) return [];
    const display = field.key === 'driverOption'
      ? (value === 'with_driver' ? 'Có tài xế' : value === 'without_driver' ? 'Tự lái' : value)
      : value;
    return [`• ${field.label}: ${display}`];
  });
  return `Dạ, em đã ghi nhận đầy đủ thông tin:\n${rows.join('\n')}\nAnh/chị kiểm tra lại và xác nhận giúp em ạ.`;
}

const fieldsSchema = (setup: BookingSetup) => ({
  type: Type.OBJECT,
  required: ['fields', 'clearFields'],
  properties: {
    fields: { type: Type.OBJECT, properties: Object.fromEntries(setup.fields.map((field) => [field.key, { type: Type.STRING }])) },
    clearFields: { type: Type.ARRAY, items: { type: Type.STRING, enum: setup.fields.map((field) => field.key) } },
  },
});

async function geminiExtract(setup: BookingSetup, message: string, history: any[], fields: Record<string, string>, call: ModelCall) {
  const system = `Bạn là bước dự phòng xác nhận/trích xuất dữ liệu dịch vụ ${SERVICE_LABELS[setup.service]}. ${setup.instructions}\nĐọc tối đa 7 lượt gần nhất và đối chiếu tin nhắn mới nhất với dữ liệu hiện có. Trả JSON {"fields":{},"clearFields":[]}. Chỉ đưa vào fields các giá trị được khách nói rõ ở tin mới nhất. Chỉ đưa key vào clearFields khi khách nói rõ muốn xóa/bỏ trường đó; tuyệt đối không coi việc không nhắc lại là xóa. Không tự điền dữ liệu, không trả lời khách, không báo giá.`;
  return call(system, { message, history: recentHistory(history, message).slice(-7), currentInfo: fields }, fieldsSchema(setup));
}

async function geminiFinalReview(setup: BookingSetup, message: string, history: any[], fields: Record<string, string>, call: ModelCall) {
  const schema = { type: Type.OBJECT, required: ['valid', 'invalidFields'], properties: {
    valid: { type: Type.BOOLEAN },
    invalidFields: { type: Type.ARRAY, items: { type: Type.STRING, enum: setup.fields.map((field) => field.key) } },
  } };
  const system = `Bạn là bước kiểm tra cuối cho hồ sơ ${SERVICE_LABELS[setup.service]}. Đối chiếu 7 lượt hội thoại gần nhất với toàn bộ hồ sơ hiện tại. Không tự sửa hay bổ sung giá trị. Trả {"valid":boolean,"invalidFields":[]} trong đó invalidFields chỉ gồm trường không có căn cứ, mâu thuẫn hoặc đã bị khách yêu cầu xóa mà chưa xử lý đúng. Nếu hồ sơ phù hợp, valid=true và invalidFields=[].`;
  return call(system, { latestMessage: message, recentHistory: recentHistory(history, message).slice(-7), completeFields: fields }, schema);
}

export async function bookingStep(setup: BookingSetup, message: string, history: any[], current: any, call: ModelCall, trace: (step: AITraceStep) => void, qwenTimeoutMs = 180_000) {
  const info = baseInfo(current);
  const previousFields = { ...(info.serviceDraft?.fields || {}) } as Record<string, string>;
  const fields: Record<string, string> = {};
  for (const field of setup.fields) {
    const value = safeField(field, previousFields[field.key]);
    if (value) fields[field.key] = value;
  }
  if (setup.service === 'rent' && !fields.driverOption) fields.driverOption = 'with_driver';
  const required = setup.fields.filter((field) => !field.optional);
  let patch: Record<string, unknown> = ruleExtractText(message, setup, history, fields);
  const rulePatch = { ...patch };
  let clearFields: string[] = [];
  let qwenFailed = false;
  let source: 'rule' | 'qwen' | 'gemini' | 'rule_fallback' = 'rule';
  let reply = '';
  const rejected: string[] = [];
  let finalAuditValid = false;
  let finalAuditFailed = false;
  let geminiCreditsExhausted = false;

  if (info.serviceDraft?.confirmationStatus === 'awaiting_confirmation' && !isCorrectionMessage(message) && !Object.keys(rulePatch).length) {
    let decision = ruleConfirmation(message);
    trace({ node: `${setup.service}_confirmation_rule`, status: decision === 'unclear' ? 'skip' : 'ok', reason: decision === 'confirm' ? 'CONFIRMATION_RECOGNIZED' : decision === 'reject' ? 'CONFIRMATION_REJECTED' : 'RULE_UNCLEAR' });
    if (decision === 'unclear') {
      try {
        const result = await qwenConfirmation(message, history, setup, fields, qwenTimeoutMs);
        decision = result.decision;
        trace({ node: `${setup.service}_confirmation_qwen`, status: 'ok', reason: 'CONFIRMATION_CLASSIFIED', elapsedMs: result.elapsedMs, detail: { decision, model: result.model, rawOutput: result.rawOutput } });
      } catch (error) {
        trace({ node: `${setup.service}_confirmation_qwen`, status: 'error', reason: 'QWEN_CONFIRMATION_FAILED', detail: errorDetail(error) });
      }
    }

    const accepted = decision === 'confirm';
    const confirmationStatus = accepted ? 'quote_pending' : 'awaiting_confirmation';
    const reply = accepted
      ? 'Dạ, em đã ghi nhận anh/chị xác nhận thông tin. Anh/chị chờ em một chút, em kiểm tra giá rồi báo lại ạ.'
      : decision === 'reject'
        ? 'Dạ, anh/chị cho em biết mục thông tin nào cần chỉnh nhé. Nếu các thông tin đã đúng, anh/chị xác nhận giúp em ạ.'
        : 'Anh/chị xác nhận giúp em: thông tin trên đã đúng chưa ạ? Nếu cần sửa, mình cho em biết mục cần chỉnh nhé.';
    const serviceDraft = { ...info.serviceDraft, fields, ready: true, missing: [], needsStaff: accepted, confirmationStatus };
    const shippingInfo = {
      ...info,
      serviceDraft,
      missingFields: [],
      missingKeys: [],
      isComplete: false,
      isConfirmed: false,
      nextAction: accepted ? 'QUOTE_PENDING_MANUAL' : 'AWAIT_CONFIRMATION',
      nextQuestion: reply,
    };
    trace({ node: 'rule_confirmation_reply', status: 'ok', reason: accepted ? 'QUOTE_PENDING_NO_API' : decision === 'reject' ? 'ASK_FOR_CORRECTION' : 'ASK_CONFIRMATION_AGAIN', detail: { decision, output: reply } });
    return { reply, shippingInfo, quickReplies: [], source: 'rule' as const };
  }

  if (message.trim() && isPriceQuestion(message)) {
    reply = NO_QUOTE_API_REPLY;
    trace({ node: 'quote_guard', status: 'ok', reason: 'NO_QUOTE_API', detail: { service: setup.service } });
  } else if (meaningfulMessage(message)) {
    try {
      const extracted = await extractWithQwen({
        message,
        service: SERVICE_LABELS[setup.service],
        instructions: setup.instructions,
        fields: setup.fields,
        history: recentHistory(history, message).slice(-7),
        currentInfo: fields,
        timeoutMs: qwenTimeoutMs,
      });
      patch = { ...extracted.fields, ...rulePatch };
      clearFields = extracted.clearFields.filter(
        (key): key is string => typeof key === 'string'
      );
      source = 'qwen';
      trace({ node: `${setup.service}_qwen_extract`, status: 'ok', reason: 'QWEN_PATCH_RECEIVED', elapsedMs: extracted.elapsedMs, detail: extracted.detail });
      const suspiciousLoss = setup.fields.filter((field) => Boolean(fields[field.key]) && (
        clearFields.includes(field.key) || Object.prototype.hasOwnProperty.call(patch, field.key) && (patch[field.key] === null || patch[field.key] === '')
      ));
      const invalidationNotGrounded = suspiciousLoss.some((field) => !isExplicitClear(message, field));
      const noUsefulExtraction = !Object.keys(patch).some((key) => patch[key] !== null && patch[key] !== '') && clearFields.length === 0;
      if (suspiciousLoss.length && invalidationNotGrounded) {
        trace({ node: `${setup.service}_qwen_loss_guard`, status: 'info', reason: 'GEMINI_CONFIRM_REQUIRED_FOR_FIELD_REMOVAL', detail: { fields: suspiciousLoss.map((field) => field.key) } });
        clearFields = suspiciousLoss.map((field) => field.key);
      }
      if (noUsefulExtraction) qwenFailed = true;
    } catch (error) {
      qwenFailed = true;
      trace({ node: `${setup.service}_qwen_extract`, status: 'error', reason: 'QWEN_EXTRACTION_FAILED', detail: errorDetail(error) });
    }

    // Gemini is the immediate fallback for a failed/unusable Qwen result, and the verifier for every proposed deletion.
    if (qwenFailed || clearFields.length) {
      const started = Date.now();
      try {
        const result = await geminiExtract(setup, message, history, fields, call);
        if (!result.value || typeof result.value.fields !== 'object' || !result.value.fields || Array.isArray(result.value.fields) || !Array.isArray(result.value.clearFields)) throw new Error('GEMINI_EXTRACTION_SCHEMA');
        const geminiPatch = result.value.fields as Record<string, unknown>;
        const geminiClear = result.value.clearFields.filter((key: unknown): key is string => typeof key === 'string' && setup.fields.some((field) => field.key === key));
        if (qwenFailed) patch = { ...patch, ...geminiPatch };
        // Only Gemini can authorize a clear. It must independently see an explicit customer request in the recent turns.
        const confirmedClears = geminiClear.filter((key: string) => {
          const field = setup.fields.find((item) => item.key === key)!;
          return isExplicitClear(message, field);
        });
        clearFields = confirmedClears;
        trace({ node: `${setup.service}_gemini_fallback`, status: 'ok', reason: qwenFailed ? 'QWEN_FALLBACK_EXTRACTED' : 'GEMINI_CONFIRMED_FIELD_CHANGE', elapsedMs: Date.now() - started, detail: { ...result.detail, confirmedClears } });
        source = 'gemini';
      } catch (error) {
        geminiCreditsExhausted ||= isGeminiCreditsExhausted(error);
        trace({ node: `${setup.service}_gemini_fallback`, status: 'error', reason: error instanceof ChainError ? error.code : 'GEMINI_ERROR', detail: error instanceof ChainError ? error.detail : errorDetail(error) });
        // If confirmation fails, keep the last accepted value. Never erase a field on an unverified model signal.
        clearFields = [];
        if (qwenFailed) source = 'rule_fallback';
      }
    }

    for (const field of setup.fields) {
      if (clearFields.includes(field.key)) {
        if (fields[field.key] && isExplicitClear(message, field)) delete fields[field.key];
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(patch, field.key)) continue; // omitted in a sparse patch means preserve
      if (patch[field.key] === null || patch[field.key] === '') continue; // null is not a deletion without Gemini confirmation
      const value = safeField(field, patch[field.key]);
      if (!value || !isGrounded(message, value, field)) rejected.push(field.key);
      else fields[field.key] = value;
    }
    if (rejected.length) trace({ node: 'booking_field_validation', status: 'info', reason: 'UNTRUSTED_FIELDS_IGNORED', detail: { rejected } });
  }

  const missing = required.filter((field) => !fields[field.key]);
  let ready = !setup.flexible && missing.length === 0;
  if (ready && !reply) {
    const started = Date.now();
    try {
      const audit = await geminiFinalReview(setup, message, history, fields, call);
      if (!audit.value || typeof audit.value.valid !== 'boolean' || !Array.isArray(audit.value.invalidFields)) throw new Error('GEMINI_FINAL_REVIEW_SCHEMA');
      const invalidKeys = audit.value.invalidFields.filter((key: unknown): key is string => typeof key === 'string' && setup.fields.some((field) => field.key === key));
      trace({ node: `${setup.service}_gemini_final_review`, status: 'ok', reason: audit.value.valid && !invalidKeys.length ? 'FINAL_REVIEW_VALID' : 'FINAL_REVIEW_INVALID', elapsedMs: Date.now() - started, detail: { ...audit.detail, invalidFields: invalidKeys } });
      finalAuditValid = audit.value.valid && invalidKeys.length === 0;
      if (!finalAuditValid) {
        for (const key of invalidKeys) delete fields[key];
        ready = false;
      }
    } catch (error) {
      geminiCreditsExhausted ||= isGeminiCreditsExhausted(error);
      trace({ node: `${setup.service}_gemini_final_review`, status: 'error', reason: error instanceof ChainError ? error.code : 'GEMINI_ERROR', detail: error instanceof ChainError ? error.detail : errorDetail(error) });
      // Local field validation and grounding are already complete. If Gemini is unavailable,
      // let the customer inspect and confirm the summary instead of blocking the conversation.
      finalAuditFailed = true;
    }
  }

  const stillMissing = required.filter((field) => !fields[field.key]);
  const readyForCustomerConfirmation = !setup.flexible && ready && stillMissing.length === 0 && (finalAuditValid || finalAuditFailed);
  if (!reply) {
    if (readyForCustomerConfirmation) reply = confirmationSummary(setup, fields);
    else if (stillMissing.length) reply = ruleQuestions(stillMissing, history);
    else if (rejected.length) reply = 'Dạ, thông tin này chưa đủ rõ để em ghi nhận. Anh/chị diễn đạt lại giúp em nhé ạ.';
    else if (!finalAuditValid && !finalAuditFailed && !setup.flexible) reply = 'Dạ, em cần xác nhận lại một vài thông tin chưa khớp với nội dung trao đổi. Anh/chị kiểm tra và gửi lại giúp em nhé ạ.';
    else reply = setup.completion;
  }
  const ruleAndQwenFailed = Object.keys(rulePatch).length === 0 && (qwenFailed || rejected.length > 0);
  if (geminiCreditsExhausted && ruleAndQwenFailed) {
    reply = `${reply} ${OPS_SUPPORT_ON_AI_CREDITS_EXHAUSTED}`.trim();
    trace({ node: 'rule_ops_fallback', status: 'ok', reason: 'GEMINI_CREDITS_EXHAUSTED', detail: { ruleExtraction: 'no usable fields', qwenExtraction: 'failed or rejected', reply: OPS_SUPPORT_ON_AI_CREDITS_EXHAUSTED } });
  }
  if (/(?:\d[\d., ]*\s*(?:đồng|vnđ|vnd|₫)|đã\s+(?:đặt xe|đặt phòng|thanh toán|điều xe|chuyển cho nhân viên))/iu.test(reply)) reply = NO_QUOTE_API_REPLY;

  // In these service drafts, LLMs extract/review data only; the rule layer writes every customer-facing response.
  source = 'rule';
  trace({ node: 'rule_reply', status: 'ok', reason: readyForCustomerConfirmation ? 'RULE_CONFIRMATION_SUMMARY' : stillMissing.length ? 'RULE_FOLLOWUP_SELECTED' : 'RULE_RESPONSE_CREATED', detail: { output: reply, askedMissingKeys: stillMissing.slice(0, 2).map((field) => field.key) } });

  const serviceDraft: ServiceDraft = { fields, ready: readyForCustomerConfirmation, missing: stillMissing.map((field) => field.label), needsStaff: false, ...(readyForCustomerConfirmation ? { confirmationStatus: 'awaiting_confirmation' as const } : {}) };
  const shippingInfo = {
    ...info,
    serviceDraft,
    completionRate: setup.flexible ? 0 : Math.round(((required.length - stillMissing.length) / Math.max(required.length, 1)) * 100),
    missingFields: serviceDraft.missing,
    missingKeys: stillMissing.map((field) => field.key),
    isComplete: false,
    isConfirmed: false,
    nextQuestion: reply,
    nextMissingKey: stillMissing[0]?.key,
    nextAction: readyForCustomerConfirmation ? 'AWAIT_CONFIRMATION' : 'ASK_FIELD',
  };
  return { reply, shippingInfo, quickReplies: [], source };
}
