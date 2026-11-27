import { Type } from '@google/genai';
import { apiKey, callGeminiStructured, isGeminiQuotaError } from './gemini-structured';
import { expandVietnameseShorthand } from './mediaAgent';
import { formatVnd, parseBaseQuoteAmountVnd, type OrderFormData } from './dispatchAgent';

export function buildPaymentLinkMessage(
  trackingCode: string,
  baseUrl?: string,
  totalVnd?: number | null
): string {
  const safeBase = (baseUrl || process.env.APP_URL || 'http://localhost:2700').replace(/\/+$/, '');
  const payUrl = `${safeBase}/pay/${trackingCode}`;
  const amountText = totalVnd ? ` (${formatVnd(totalVnd)})` : '';
  return (
    `💳 Dạ gửi anh/chị link thanh toán VietQR cho đơn #${trackingCode}${amountText} ạ:\n` +
    `👉 ${payUrl}\n` +
    `(Hoặc anh/chị có thể thanh toán trực tiếp cho tài xế khi bàn giao / nhận hàng đều được ạ!)`
  );
}

export function evaluateNegotiationOffer(
  message: string,
  currentCustomerQuoteVnd?: number | null,
  baseCostVnd?: number | null
): {
  isNegotiation: boolean;
  canAutoAcceptDiscount: boolean;
  discountedVnd?: number;
  replyToCustomer?: string;
} {
  const lower = String(message || '').toLowerCase();
  const isNeg =
    /\b(giảm|bớt|chốt giá|thương lượng|mắc quá|đắt quá|cao quá|fix|xuống chút|tròn)\b/i.test(lower) &&
    !lower.includes('hủy') &&
    !lower.includes('không đi');

  if (!isNeg || !currentCustomerQuoteVnd) {
    return { isNegotiation: false, canAutoAcceptDiscount: false };
  }

  const offeredVnd = parseBaseQuoteAmountVnd(message);
  const floorVnd = baseCostVnd ? Math.round(baseCostVnd * 1.1) : Math.round(currentCustomerQuoteVnd * 0.9);
  const tenPercentOff = Math.round(currentCustomerQuoteVnd * 0.9);

  if (offeredVnd && offeredVnd >= floorVnd && offeredVnd < currentCustomerQuoteVnd) {
    return {
      isNegotiation: true,
      canAutoAcceptDiscount: true,
      discountedVnd: offeredVnd,
      replyToCustomer: `Dạ em xin phép hỗ trợ giảm mức giá tốt nhất cho anh/chị là ${formatVnd(offeredVnd)} ạ. Nếu anh/chị đồng ý mức giá này, nhắn "Chốt" để em điều xe ngay cho mình nhé!`,
    };
  }

  if (!offeredVnd && tenPercentOff >= floorVnd) {
    return {
      isNegotiation: true,
      canAutoAcceptDiscount: true,
      discountedVnd: tenPercentOff,
      replyToCustomer: `Dạ để hỗ trợ anh/chị chốt đơn thuận tiện nhất, bên em xin phép giảm 10% còn ${formatVnd(tenPercentOff)} ạ. Anh/chị chốt giúp em nhé!`,
    };
  }

  return { isNegotiation: true, canAutoAcceptDiscount: false };
}

export function fallbackCustomerQuoteResponse(message: string): {
  decision: 'ACCEPT' | 'DECLINE' | 'ASK_INFO';
  translated_to_staff?: string;
  message_to_partner?: string;
  reply_to_customer: string;
} {
  const lower = String(message || '').toLowerCase().trim();
  const expanded = expandVietnameseShorthand(message);

  const isQuestion =
    lower.includes('?') ||
    /\b(hỏi|cho hỏi|có hỗ trợ|có bốc|bao gồm|mấy giờ|khi nào|bao lâu|xe gì|nhiệt độ|bảo hiểm|hóa đơn|vat|giảm|bớt|thương lượng|được không|đc không|sao|thế nào|như nào|nào|không ạ|ko ạ|how|what|when|which|can you|do you|is there|include)\b/i.test(
      lower
    );

  const isAccept =
    !isQuestion &&
    /\b(chốt|đồng ý|ok|oke|okie|okay|nhất trí|làm đi|đi đơn|đặt xe|tiến hành|chạy đi|lấy đi|chấp nhận|gửi xe|confirm|accept|agreed|deal|yes|book|proceed|go ahead)\b/i.test(
      lower
    );

  if (isAccept) {
    return {
      decision: 'ACCEPT',
      message_to_partner: 'Khách chốt, anh/chị đi đơn cho em nhé.',
      reply_to_customer:
        'Dạ em cảm ơn anh/chị đã xác nhận chốt đơn! Bên em đã báo đối tác đi đơn ngay cho mình ạ.',
    };
  }

  const isDecline =
    !isQuestion &&
    (lower === 'không' ||
      lower === 'ko' ||
      lower === 'k' ||
      lower === 'thôi' ||
      lower === 'no' ||
      /\b(từ chối|hủy|huỷ|không đi|ko đi|không đặt|ko đặt|không chốt|ko chốt|không gửi|ko gửi|thôi không|thôi nhé|thôi ạ|đắt quá|cao quá|mắc quá|bên khác|không cần nữa|ko cần|cancel|decline|reject|no thanks|too expensive|never mind)\b/i.test(
        lower
      ));

  if (isDecline) {
    return {
      decision: 'DECLINE',
      reply_to_customer: 'Dạ anh/chị cần em hỗ trợ gì thêm thì cứ nhắn em ạ.',
    };
  }

  return {
    decision: 'ASK_INFO',
    translated_to_staff: expanded,
    reply_to_customer: '',
  };
}

export async function analyzeCustomerQuoteResponse(body: {
  message?: string;
  quotePartner?: string;
  form?: Partial<OrderFormData>;
} = {}): Promise<any> {
  try {
    const { message, quotePartner = 'DCE', form } = body;
    if (!message) return { error: 'Message is required' };

    if (!apiKey) {
      return { ...fallbackCustomerQuoteResponse(message), model_used: 'fallback' };
    }

    const prompt = `
Bạn là AI CSKH và biên dịch viên điều phối vận tải.
Khách hàng vừa nhận được báo giá từ đối tác ${quotePartner} và phản hồi lại:
"${message}"

Thông tin đơn hàng:
1) Địa chỉ lấy hàng: ${form?.dia_chi_lay_hang || ''}
2) Địa chỉ giao hàng: ${form?.dia_chi_giao_hang || ''}
3) Thông tin hàng: ${form?.thong_tin_hang || ''}
4) Thời gian giao nhận: ${form?.thoi_gian_giao_nhan || ''}

Nhiệm vụ bắt buộc:
1. Phân loại "decision" thành 1 trong 3 giá trị duy nhất:
   - "ACCEPT": Khách hàng đồng ý với báo giá, xác nhận chốt đơn, bảo đi đơn/đặt xe ("ok", "chốt", "đồng ý", "đi đơn đi", "làm nhé", "yes", "book"...).
   - "DECLINE": Khách hàng từ chối báo giá, hủy hoặc không muốn gửi nữa ("không", "thôi", "đắt quá", "hủy", "không đi nữa", "no", "cancel"...).
   - "ASK_INFO": Khách hàng hỏi thêm thông tin về dịch vụ/xe/thời gian/bốc xếp/bảo hiểm/hóa đơn/thương lượng giá... trước khi quyết định.
2. Nếu decision == "ACCEPT":
   - "message_to_partner": Đúng nguyên câu "Khách chốt, anh/chị đi đơn cho em nhé."
   - "reply_to_customer": "Dạ em cảm ơn anh/chị đã xác nhận chốt đơn! Bên em đã báo đối tác đi đơn ngay cho mình ạ."
3. Nếu decision == "DECLINE":
   - "reply_to_customer": Đúng nguyên câu "Dạ anh/chị cần em hỗ trợ gì thêm thì cứ nhắn em ạ."
4. Nếu decision == "ASK_INFO":
   - "translated_to_staff": Dịch sát nghĩa câu hỏi/thắc mắc của khách sang tiếng Việt điều vận ngắn gọn, rõ ràng để chuyển tiếp cho đối tác ${quotePartner}.
   - "reply_to_customer": ""
`;

    const { data: parsed, model_used } = await callGeminiStructured(prompt, {
      type: Type.OBJECT,
      properties: {
        decision: { type: Type.STRING },
        translated_to_staff: { type: Type.STRING },
        message_to_partner: { type: Type.STRING },
        reply_to_customer: { type: Type.STRING },
      },
      required: ['decision', 'reply_to_customer'],
    });

    if (parsed.decision === 'ACCEPT') {
      parsed.message_to_partner = 'Khách chốt, anh/chị đi đơn cho em nhé.';
      parsed.reply_to_customer =
        parsed.reply_to_customer ||
        'Dạ em cảm ơn anh/chị đã xác nhận chốt đơn! Bên em đã báo đối tác đi đơn ngay cho mình ạ.';
    } else if (parsed.decision === 'DECLINE') {
      parsed.reply_to_customer = 'Dạ anh/chị cần em hỗ trợ gì thêm thì cứ nhắn em ạ.';
    } else {
      parsed.reply_to_customer = '';
    }

    return { ...parsed, model_used };
  } catch (err: any) {
    return {
      ...fallbackCustomerQuoteResponse(body.message || ''),
      model_used: 'smart-dispatch-engine',
      quota_exceeded: isGeminiQuotaError(err),
    };
  }
}
