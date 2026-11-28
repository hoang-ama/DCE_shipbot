import { callPassengerQwen, parsePassengerQwenJson } from '../../../chatbot/passenger-transport/qwen-client';

export const isPriceQuestion = (message: string) =>
  /(?:báo\s*giá|giá(?:\s+(?:bao nhiêu|thế nào|sao|cước|tiền))?|bao nhiêu\s+(?:tiền|đồng|vnd)|phí\s+(?:bao nhiêu|là))/iu.test(message);

export const NO_QUOTE_API_REPLY =
  'Dạ, hệ thống hiện chưa kết nối API báo giá nên em chưa thể xác nhận mức giá chính thức. Nhân viên cần kiểm tra thông tin chuyến/hàng để báo giá chính xác ạ.';

export async function extractWithQwen(input: {
  message: string;
  service: string;
  instructions: string;
  fields: Array<{ key: string; label: string; optional?: boolean }>;
  history?: Array<{ role?: string; content?: string; sender?: string; text?: string }>;
  currentInfo?: Record<string, string>;
  timeoutMs?: number;
}) {
  const system = [
    `Bạn là bộ trích xuất thông tin cho dịch vụ ${input.service}. ${input.instructions}`,
    `Các trường hợp lệ: ${input.fields.map((field) => `${field.key} (${field.label}${field.optional ? ', tùy chọn' : ''})`).join('; ')}.`,
    'Chỉ trích xuất dữ kiện khách vừa nói hoặc sửa trong tin nhắn mới nhất. Trả đúng JSON: {"fields":{},"clearFields":[]}.',
    'fields là bản vá thưa: chỉ ghi những giá trị có bằng chứng trong tin nhắn mới nhất; không ghi null cho trường không được nhắc đến. Nếu khách nói rõ muốn xóa/bỏ một thông tin đã lưu, đưa key vào clearFields, không tự xóa chỉ vì khách không nhắc lại.',
    'Không trả lời khách, không hỏi thêm, không phân loại dịch vụ, không suy diễn, không báo giá. Dữ liệu hiện có và lịch sử chỉ dùng để hiểu nội dung chỉnh sửa.',
  ].join('\n');
  const recentHistory = (input.history || []).slice(-5).map((item) => ({
    role: item.role || item.sender || 'user',
    content: String(item.content || item.text || '').slice(0, 800),
  }));
  const generated = await callPassengerQwen(system, {
    service: input.service,
    currentInfo: input.currentInfo || {},
    recentHistory,
    latestMessage: input.message,
  }, 128, input.timeoutMs ?? 180_000);
  const value = parsePassengerQwenJson(generated.text);
  if (!value || typeof value !== 'object' || !value.fields || typeof value.fields !== 'object' || Array.isArray(value.fields)) {
    throw new Error('QWEN_EXTRACTION_SCHEMA');
  }
  const allowed = new Set(input.fields.map((field) => field.key));
  const fields: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value.fields)) {
    if (allowed.has(key)) fields[key] = fieldValue;
  }
  const clearFields = Array.isArray(value.clearFields)
    ? [...new Set(value.clearFields.filter((key: unknown): key is string => typeof key === 'string' && allowed.has(key)))]
    : [];
  return { fields, clearFields, model: generated.model, elapsedMs: generated.elapsedMs, detail: { rawOutput: generated.text, parsed: { fields, clearFields } } };
}
