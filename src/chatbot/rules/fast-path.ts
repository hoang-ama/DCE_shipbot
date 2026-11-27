import { evaluateCompleteness } from '../extraction/express';
import { chatbotAI } from '../../config/chatbot-ai';

export type ChatResult = { reply: string; shippingInfo: any; quickReplies: string[] };
export function normalizeMessage(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase('vi').trim()
    .replace(/\s+/gu, ' ').replace(/[.!?…]+$/gu, '').trim();
}

export function fastPath(message: string, history: any[], info: any): ChatResult | null {
  const config = chatbotAI.fastPath;
  if (!config.enabled || typeof message !== 'string') return null;
  const text = normalizeMessage(message);
  if (!text || [...text].length > config.maxChars || text.split(/\s+/u).length > config.maxWords) return null;
  const active = Boolean(info?.sender?.address || info?.receiver?.address || info?.cargo?.name ||
    info?.cargo?.weight || info?.cargo?.weightKg || info?.cargo?.dimensions?.raw || info?.deliveryTime ||
    info?.isComplete || info?.isConfirmed);
  let shippingInfo = info || {};
  let reply: string;
  if (/^(?:xin chào|chào(?: bạn| anh| chị| em| shop| ad)?|hi|hello|alo(?: shop| em| bạn)?|hey|(?:em|anh|chị) chào (?:anh|chị|em))(?: ạ| nhé| nha)?$/u.test(text)) {
    reply = active ? 'Em chào anh/chị, mình cần bổ sung thông tin gì ạ?' :
      'Em chào anh/chị ạ! Anh/chị cho em xin địa chỉ hoặc điểm lấy hàng cụ thể nhé.';
    if (!active && !shippingInfo.nextMissingKey) shippingInfo = {...shippingInfo,...evaluateCompleteness(shippingInfo)};
  } else if (/^(?:cảm ơn(?: bạn| anh| chị| em| shop)?|thank you|thanks|thank|cám ơn(?: em| bạn)?)(?: ạ| nhé| nha)?$/u.test(text)) {
    reply = 'Không có gì ạ! Anh/chị cần hỗ trợ thêm cứ nhắn em nhé.';
  } else if (/^(?:tạm biệt|bye|goodbye|bye bye)(?: ạ| nhé| nha)?$/u.test(text)) {
    reply = 'Em chào anh/chị, hẹn gặp lại ạ!';
  } else if (/^(?:cho (?:tôi|mình|anh|chị|em) )?(?:gặp|nói chuyện với|chuyển (?:sang|cho)) (?:nhân viên|tổng đài viên|người thật|tư vấn viên)(?: ạ| nhé| nha)?$/u.test(text)) {
    // No claim of a successful handover: this phase has no new dispatch action.
    reply = 'Anh/chị muốn gặp nhân viên hỗ trợ ạ. Hiện em chưa thể tự chuyển cuộc trò chuyện cho nhân viên; anh/chị vui lòng liên hệ tổng đài Đi Chung.';
  } else return null;
  return { reply, shippingInfo, quickReplies: [] };
}

// Preserve the original confirmation/payment semantics; difficult changes and support
// go straight to the existing Gemini workflow, not a new booking inferred by Qwen.
export function requiresLegacy(message: string, info: any): boolean {
  const text = normalizeMessage(message);
  return Boolean(info?.isComplete || info?.isConfirmed || info?.trackingCode ||
    /(?:hủy|hoàn tiền|đổi lịch|đổi giờ|sửa|nhầm|không đúng|không phải|thay đổi|chỉnh lại|hóa đơn|vat|thanh toán|chuyển khoản|báo giá|bao nhiêu|giá cước|giảm giá|khiếu nại|gặp nhân viên|tổng đài viên|đặt xe|thuê xe|du lịch|tour|https?:\/\/)/iu.test(text) ||
    /^(?:ok(?:e|ay)?|đồng ý|đúng rồi|chốt|không|chưa|vâng|ừ)(?: em| anh| chị| ạ| nhé| nha)*$/u.test(text));
}
