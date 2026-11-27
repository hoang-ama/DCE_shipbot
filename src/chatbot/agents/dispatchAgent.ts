import { Type } from '@google/genai';
import { parseVietnameseMoney } from '../../modules/pricing/quotes';
import { apiKey, callGeminiStructured, isGeminiQuotaError } from './gemini-structured';
import { expandVietnameseShorthand, stripStaffToCskhFillers } from './mediaAgent';

export interface OrderFormData {
  dia_chi_lay_hang: string | null;
  dia_chi_giao_hang: string | null;
  thong_tin_hang: string | null;
  thoi_gian_giao_nhan: string | null;
  thong_tin_bo_sung?: string | null;
}

export type PartnerTier = 'DCE' | 'CSDT';

export function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN').replace(/,/g, '.')} VNĐ`;
}

/**
 * Compute +30% customer price from partner base cost (applies equally to Tier 1 DCE Ops and Tier 2 CSĐT).
 */
export function applyMargin30Percent(baseCostVnd: number): number {
  return Math.round(baseCostVnd * 1.3);
}

/**
 * Parse a partner's shorthand or formatted base price in VNĐ (e.g. "1tr2" -> 1_200_000).
 */
export function parseBaseQuoteAmountVnd(text: string): number | null {
  const expanded = expandVietnameseShorthand(text);
  const formattedMatch = expanded.match(/(\d{1,3}(?:\.\d{3})+)\s*VNĐ/i);
  if (formattedMatch) {
    const val = parseInt(formattedMatch[1].replace(/\./g, ''), 10);
    if (val >= 10_000) return val;
  }
  const directParsed = parseVietnameseMoney(text);
  if (directParsed && directParsed >= 10_000) return directParsed;
  return parseVietnameseMoney(expanded);
}

export function fallbackStaffIntent(
  staffMessage: string,
  isPostQuoteFollowUp = false
): {
  intent: 'QUOTE' | 'NEED_MORE_INFO' | 'REJECT';
  reasoning: string;
  translated_message_for_customer: string;
  clarification_question?: string;
  quote_details?: string;
} {
  const lower = staffMessage.toLowerCase().trim();
  const expanded = expandVietnameseShorthand(staffMessage);
  const cleaned = stripStaffToCskhFillers(expanded) || expanded;

  if (
    lower === 'không' ||
    lower === 'ko' ||
    lower === 'k' ||
    lower === 'no' ||
    lower.startsWith('không nhận') ||
    lower.startsWith('ko nhận') ||
    lower.includes('không nhận') ||
    lower.includes('từ chối') ||
    lower.includes('hết xe') ||
    lower.includes('không chạy') ||
    lower.includes('không hỗ trợ') ||
    lower.includes('cannot') ||
    lower.includes('reject')
  ) {
    return {
      intent: 'REJECT',
      reasoning: 'Nhân viên từ chối nhận tuyến đường này.',
      translated_message_for_customer: 'Tuyến này bên em không hỗ trợ.',
    };
  }

  if (
    lower.includes('?') ||
    lower.includes('hỏi lại') ||
    lower.includes('kích thước') ||
    lower.includes('quy cách') ||
    lower.includes('mấy giờ') ||
    lower.includes('cụ thể')
  ) {
    return {
      intent: 'NEED_MORE_INFO',
      reasoning: 'Nhân viên yêu cầu làm rõ thêm thông tin đơn hàng.',
      clarification_question: cleaned,
      translated_message_for_customer: `Dạ để thuận tiện cho việc sắp xếp phương tiện vận chuyển, anh/chị cho em hỏi thêm: ${cleaned}`,
    };
  }

  const hasPrice = /\d+(?:\.\d{3})*\s*VNĐ|\b\d+\s*(?:k|tr|triệu|đ|vnđ)\b/i.test(cleaned);
  if (isPostQuoteFollowUp && !hasPrice) {
    return {
      intent: 'QUOTE',
      reasoning: 'Nhân viên giải đáp thông tin sau báo giá cho khách.',
      quote_details: cleaned,
      translated_message_for_customer: `Dạ đối tác phản hồi cho mình là: ${cleaned} ạ. Anh/chị xem nếu phù hợp thì xác nhận giúp em để bên em đi đơn nhé!`,
    };
  }

  const isPurePrice = /^\d{1,3}(?:\.\d{3})+\s*VNĐ$/i.test(cleaned);
  const customerQuoteMessage = isPurePrice
    ? `Dạ bên em xin gửi báo giá cước vận chuyển cho đơn hàng của anh/chị là ${cleaned} ạ. Anh/chị xác nhận giúp em để bên em tiến hành điều xe nhé!`
    : `Dạ bên em xin gửi báo giá cước vận chuyển cho đơn hàng của anh/chị: ${cleaned} ạ. Anh/chị xác nhận giúp em để bên em tiến hành điều xe nhé!`;

  return {
    intent: 'QUOTE',
    reasoning: 'Nhân viên cung cấp thông tin cước phí / báo giá.',
    quote_details: cleaned,
    translated_message_for_customer: customerQuoteMessage,
  };
}

export function buildDispatchFormMessage(opts: {
  trackingCode: string;
  tier: PartnerTier;
  form: Partial<OrderFormData>;
  additionalInfo?: string;
  baseUrl?: string;
  isWaterfallFallback?: boolean;
}): string {
  const lines = [
    opts.isWaterfallFallback
      ? `📦 [ĐƠN CHUYỂN TỪ DCE - #${opts.trackingCode}] Đội xe DCE vừa từ chối nhận tuyến, nhờ anh/chị CSĐT xem & báo giá giúp em:`
      : `📦 [ĐƠN CẦN BÁO GIÁ - #${opts.trackingCode}]`,
    `1) Địa chỉ lấy hàng: ${opts.form.dia_chi_lay_hang || 'Chưa rõ'}`,
    `2) Địa chỉ giao hàng: ${opts.form.dia_chi_giao_hang || 'Chưa rõ'}`,
    `3) Thông tin hàng: ${opts.form.thong_tin_hang || 'Chưa rõ'}`,
    `4) Thời gian giao nhận: ${opts.form.thoi_gian_giao_nhan || 'Linh hoạt'}`,
  ];

  if (opts.additionalInfo) {
    lines.push(`5) Thông tin bổ sung: ${opts.additionalInfo}`);
  }

  lines.push('');
  lines.push('Anh/chị báo giá giúp em.');
  lines.push(
    `💡 Trả lời (hoặc Quote tin này) kèm giá gốc (VD: "#${opts.trackingCode} 1tr2"), hỏi lại khách, hoặc nhắn "Không" nếu từ chối.`
  );
  if (opts.baseUrl) {
    lines.push(`👉 Form báo giá nhanh: ${opts.baseUrl.replace(/\/$/, '')}/quote/${opts.trackingCode}`);
  }
  return lines.join('\n');
}

export async function analyzeStaffReply(body: {
  staffType?: PartnerTier | string;
  message?: string;
  form?: Partial<OrderFormData>;
  additionalInfo?: string;
  isPostQuoteFollowUp?: boolean;
} = {}): Promise<any> {
  try {
    const { staffType = 'DCE', message, form, additionalInfo = '', isPostQuoteFollowUp = false } = body;

    if (!message) {
      return { error: 'Message is required' };
    }

    const attachQuoteMetadata = (result: any) => {
      if (result.intent !== 'QUOTE') return result;
      const baseVnd = parseBaseQuoteAmountVnd(message);
      if (!baseVnd) return result;
      const customerVnd = applyMargin30Percent(baseVnd);
      const formattedCustomer = formatVnd(customerVnd);
      return {
        ...result,
        base_quote_vnd: baseVnd,
        customer_quote_vnd: customerVnd,
        customer_quote_message_with_margin: `Dạ bên em xin gửi báo giá cước vận chuyển cho đơn hàng của anh/chị là ${formattedCustomer} ạ. Anh/chị xem có phù hợp không để em chốt xe cho mình nhé!`,
      };
    };

    if (!apiKey) {
      const fallback = fallbackStaffIntent(message, Boolean(isPostQuoteFollowUp));
      return attachQuoteMetadata({ ...fallback, model_used: 'fallback' });
    }

    const staffTitle = staffType === 'DCE' ? 'Đội xe DCE (Cấp 1)' : 'Đội xe CSĐT (Cấp 2)';
    const prompt = `
Bạn là **AI CSKH** chuyên nghiệp đang đại diện công ty nói chuyện với Khách hàng.
Bạn vừa nhận được tin nhắn nội bộ từ nhân viên "${staffTitle}":
"${message}"

Thông tin đơn hàng:
1) Địa chỉ lấy hàng: ${form?.dia_chi_lay_hang || 'Chưa rõ'}
2) Địa chỉ giao hàng: ${form?.dia_chi_giao_hang || 'Chưa rõ'}
3) Thông tin hàng: ${form?.thong_tin_hang || 'Chưa rõ'}
4) Thời gian giao nhận: ${form?.thoi_gian_giao_nhan || 'Chưa rõ'}
${additionalInfo ? `5) Thông tin bổ sung: ${additionalInfo}` : ''}
${isPostQuoteFollowUp ? 'Ngữ cảnh: Trước đó đã có báo giá, khách hàng vừa hỏi thêm thông tin và đối tác đang phản hồi lại cho khách.' : ''}

Nhiệm vụ bắt buộc:
1. Phân loại "intent" thành 1 trong 3 giá trị duy nhất:
   - "QUOTE": Nhân viên đưa ra mức giá/cước phí, cập nhật giá, hoặc giải đáp/xác nhận thông tin dịch vụ để gửi lại cho khách chốt đơn.
   - "NEED_MORE_INFO": Nhân viên hỏi ngược lại thêm thông tin từ khách hàng (quy cách đóng gói, kích thước, thùng xốp/carton, nhiệt độ, giờ lấy hàng...).
   - "REJECT": Nhân viên từ chối ("Không", "Ko nhận", "Hết xe", "Không chạy", "No"...).
2. "reasoning": Giải thích ngắn gọn lý do phân loại intent.
3. DỊCH & BIÊN TẬP NỘI DUNG sang văn phong AI CSKH chuyên nghiệp trong "translated_message_for_customer":
   - TUYỆT ĐỐI KHÔNG copy nguyên văn cách nói chuyện nội bộ, tiếng lóng hay từ xưng hô của nhân viên với CSKH (VD: không giữ lại từ "em", "nhé em", "ok", "1tr2", "500k", "ko", "ý anh là", "ý em là").
   - KHÔNG tự ý xin lỗi nếu nhân viên không yêu cầu xin lỗi; hãy hỏi/báo giá/trả lời trực tiếp, lịch sự, tự nhiên.
   - BẮT BUỘC quy đổi mọi con số viết tắt sang số tiền rõ ràng (VD: "1tr2 em" -> "1.200.000 VNĐ").
   - Nếu nhân viên nhắn bằng tiếng Anh hoặc ngôn ngữ khác, dịch toàn bộ sang tiếng Việt CSKH lịch sự.
   - Nếu intent == "QUOTE": viết câu báo giá/giải đáp hoàn chỉnh, lịch sự gửi khách.
   - Nếu intent == "NEED_MORE_INFO": viết "clarification_question" và "translated_message_for_customer" trực tiếp, ngắn gọn, lịch sự để hỏi lại khách.
   - Nếu intent == "REJECT":
     * Nếu staffType == "DCE": ghi chú chuyển tiếp sang CSĐT.
     * Nếu staffType == "CSDT": "Tuyến này bên em không hỗ trợ."
`;

    const { data: parsed, model_used } = await callGeminiStructured(prompt, {
      type: Type.OBJECT,
      properties: {
        intent: {
          type: Type.STRING,
          description: "Một trong 3 giá trị: 'QUOTE', 'NEED_MORE_INFO', 'REJECT'",
        },
        reasoning: {
          type: Type.STRING,
          description: 'Lý do phân loại intent',
        },
        quote_details: {
          type: Type.STRING,
          description: 'Chi tiết báo giá đã dịch rõ nếu intent là QUOTE',
        },
        clarification_question: {
          type: Type.STRING,
          description: 'Câu hỏi đã dịch rõ nếu intent là NEED_MORE_INFO',
        },
        translated_message_for_customer: {
          type: Type.STRING,
          description: 'Nội dung tin nhắn đã dịch sang tiếng Việt CSKH lịch sự gửi cho khách hàng',
        },
      },
      required: ['intent', 'reasoning', 'translated_message_for_customer'],
    });

    return attachQuoteMetadata({
      ...parsed,
      model_used,
    });
  } catch (err: any) {
    const fallback = fallbackStaffIntent(body.message || '', Boolean(body.isPostQuoteFollowUp));
    const baseVnd = body.message ? parseBaseQuoteAmountVnd(body.message) : null;
    const customerVnd = baseVnd ? applyMargin30Percent(baseVnd) : undefined;
    return {
      ...fallback,
      ...(baseVnd
        ? {
            base_quote_vnd: baseVnd,
            customer_quote_vnd: customerVnd,
            customer_quote_message_with_margin: customerVnd
              ? `Dạ bên em xin gửi báo giá cước vận chuyển cho đơn hàng của anh/chị là ${formatVnd(customerVnd)} ạ. Anh/chị xem có phù hợp không để em chốt xe cho mình nhé!`
              : undefined,
          }
        : {}),
      model_used: 'smart-dispatch-engine',
      quota_exceeded: isGeminiQuotaError(err),
    };
  }
}
