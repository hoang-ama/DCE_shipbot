import { Type } from '@google/genai';
import { apiKey, callGeminiStructured, isGeminiQuotaError } from './gemini-structured';
import { expandVietnameseShorthand } from './mediaAgent';
import type { OrderFormData } from './dispatchAgent';

export { routeConversation } from '../services/router';
export { smartExtractVietnamese } from '../extraction/express';

export function fallbackCustomerExtract(
  userMessage: string,
  currentForm: Partial<OrderFormData>
): {
  is_form_complete: boolean;
  form_data: OrderFormData;
  missing_fields: string[];
  reply_to_customer: string;
} {
  const form: OrderFormData = {
    dia_chi_lay_hang: currentForm.dia_chi_lay_hang || null,
    dia_chi_giao_hang: currentForm.dia_chi_giao_hang || null,
    thong_tin_hang: currentForm.thong_tin_hang || null,
    thoi_gian_giao_nhan: currentForm.thoi_gian_giao_nhan || null,
    thong_tin_bo_sung: currentForm.thong_tin_bo_sung || null,
  };

  const pickupLine = userMessage.match(/(?:1\)|-\s*)?\s*Địa chỉ lấy hàng\s*:\s*([^\n\r]+)/i);
  if (pickupLine && pickupLine[1].trim()) form.dia_chi_lay_hang = pickupLine[1].trim();

  const dropoffLine = userMessage.match(/(?:2\)|-\s*)?\s*Địa chỉ giao hàng\s*:\s*([^\n\r]+)/i);
  if (dropoffLine && dropoffLine[1].trim()) form.dia_chi_giao_hang = dropoffLine[1].trim();

  const cargoLine = userMessage.match(/(?:3\)|-\s*)?\s*Thông tin hàng\s*:\s*([^\n\r]+)/i);
  if (cargoLine && cargoLine[1].trim()) form.thong_tin_hang = cargoLine[1].trim();

  const timeLine = userMessage.match(/(?:4\)|-\s*)?\s*Thời gian giao nhận\s*:\s*([^\n\r]+)/i);
  if (timeLine && timeLine[1].trim()) form.thoi_gian_giao_nhan = timeLine[1].trim();

  if (!form.dia_chi_lay_hang) {
    const fromMatch = userMessage.match(
      /(?:từ|lấy hàng tại|lấy ở|nơi gửi)\s+([A-ZÀ-Ỹa-zà-ỹ0-9\s,.-]+?)(?=\s+(?:đến|giao|vào|tới|sang|ra|về|$))/i
    );
    if (fromMatch && fromMatch[1].trim()) form.dia_chi_lay_hang = fromMatch[1].trim();
  }

  if (!form.dia_chi_giao_hang) {
    const toMatch = userMessage.match(
      /(?:đến|giao tại|giao về|vào|tới|sang|nơi nhận)\s+([A-ZÀ-Ỹa-zà-ỹ0-9\s,.-]+?)(?=\s*(?:[;\n]|$))/i
    );
    if (toMatch && toMatch[1].trim()) form.dia_chi_giao_hang = toMatch[1].trim();
  }

  if (!form.thong_tin_hang) {
    const weightMatch = userMessage.match(/(\d+(?:[.,]\d+)?\s*(?:tấn|kg|tạ|yến|khối|m3))/i);
    const knownCommodities = [
      'hoa quả', 'trái cây', 'nông sản', 'sắt thép', 'thép', 'sắt', 'máy móc',
      'vải', 'quần áo', 'đồ gỗ', 'hóa chất', 'linh kiện điện tử', 'thực phẩm',
    ];
    const lowerMsg = userMessage.toLowerCase();
    const foundCommodity = knownCommodities.find((c) => lowerMsg.includes(c));
    if (foundCommodity && weightMatch) {
      form.thong_tin_hang = `${foundCommodity.charAt(0).toUpperCase() + foundCommodity.slice(1)}, ${weightMatch[1].trim()}`;
    } else if (foundCommodity) {
      form.thong_tin_hang = foundCommodity.charAt(0).toUpperCase() + foundCommodity.slice(1);
    } else if (weightMatch) {
      form.thong_tin_hang = weightMatch[1].trim();
    }
  }

  if (!form.thoi_gian_giao_nhan) {
    const timeMatch = userMessage.match(
      /(trong ngày|hôm nay|ngày mai|sáng mai|chiều mai|gấp|\d{1,2}h|\d{1,2}\/\d{1,2})/i
    );
    if (timeMatch) {
      form.thoi_gian_giao_nhan = timeMatch[1].charAt(0).toUpperCase() + timeMatch[1].slice(1);
    }
  }

  const missing: string[] = [];
  if (!form.dia_chi_lay_hang) missing.push('Địa chỉ lấy hàng');
  if (!form.dia_chi_giao_hang) missing.push('Địa chỉ giao hàng');
  if (!form.thong_tin_hang) missing.push('Thông tin hàng');
  if (!form.thoi_gian_giao_nhan) missing.push('Thời gian giao nhận');

  const isComplete = missing.length === 0;
  const reply = isComplete
    ? `Dạ em đã tiếp nhận đầy đủ thông tin đơn hàng từ ${form.dia_chi_lay_hang} đi ${form.dia_chi_giao_hang} (${form.thong_tin_hang}, thời gian: ${form.thoi_gian_giao_nhan}). Em đã gửi sang bộ phận điều phối để lấy báo giá ngay ạ.`
    : `Dạ em đã ghi nhận thông tin. Phiền anh/chị bổ sung thêm: ${missing.join(', ')} giúp em nhé ạ.`;

  return {
    is_form_complete: isComplete,
    form_data: form,
    missing_fields: missing,
    reply_to_customer: reply,
  };
}

export async function extractCustomerForm(body: {
  message?: string;
  chatHistory?: any[];
  currentForm?: Partial<OrderFormData>;
} = {}): Promise<any> {
  try {
    const { message, chatHistory = [], currentForm = {} } = body;
    if (!message) return { error: 'Message is required' };

    if (!apiKey) {
      return { ...fallbackCustomerExtract(message, currentForm), model_used: 'fallback' };
    }

    const prompt = `
Bạn là AI CSKH điều phối vận tải tại Việt Nam.
Nhiệm vụ của bạn:
1. Trích xuất 4 trường thông tin đơn hàng từ tin nhắn của khách (hỗ trợ cả form mẫu đánh số 1, 2, 3, 4 lẫn văn bản tự nhiên, hoặc tiếng Anh dịch sang tiếng Việt chuẩn):
   - "dia_chi_lay_hang": Địa chỉ lấy hàng. Nếu chưa có giữ nguyên giá trị cũ hoặc để null.
   - "dia_chi_giao_hang": Địa chỉ giao hàng. Nếu chưa có giữ nguyên giá trị cũ hoặc để null.
   - "thong_tin_hang": Thông tin hàng (loại hàng, khối lượng/số lượng, VD: "Hoa quả, 5 kg").
   - "thoi_gian_giao_nhan": Thời gian giao nhận (VD: "Trong ngày", "Sáng mai"...).
2. "is_form_complete": Chỉ = true khi CẢ 4 trường đều đã có giá trị rõ ràng.
3. "missing_fields": Danh sách tên các trường còn thiếu trong [Địa chỉ lấy hàng, Địa chỉ giao hàng, Thông tin hàng, Thời gian giao nhận].
4. "reply_to_customer": Phản hồi lịch sự bằng tiếng Việt cho khách.

Dữ liệu Form hiện tại:
${JSON.stringify(currentForm, null, 2)}

Tin nhắn mới: "${message}"

Lịch sử gần nhất:
${JSON.stringify(chatHistory.slice(-6), null, 2)}
`;

    const { data: parsed, model_used } = await callGeminiStructured(prompt, {
      type: Type.OBJECT,
      properties: {
        is_form_complete: { type: Type.BOOLEAN },
        form_data: {
          type: Type.OBJECT,
          properties: {
            dia_chi_lay_hang: { type: Type.STRING },
            dia_chi_giao_hang: { type: Type.STRING },
            thong_tin_hang: { type: Type.STRING },
            thoi_gian_giao_nhan: { type: Type.STRING },
          },
          required: ['dia_chi_lay_hang', 'dia_chi_giao_hang', 'thong_tin_hang', 'thoi_gian_giao_nhan'],
        },
        missing_fields: { type: Type.ARRAY, items: { type: Type.STRING } },
        reply_to_customer: { type: Type.STRING },
      },
      required: ['is_form_complete', 'form_data', 'missing_fields', 'reply_to_customer'],
    });

    return { ...parsed, model_used };
  } catch (err: any) {
    return {
      ...fallbackCustomerExtract(body.message || '', body.currentForm || {}),
      model_used: 'smart-dispatch-engine',
      quota_exceeded: isGeminiQuotaError(err),
    };
  }
}

export async function translateClarification(body: {
  message?: string;
  staffType?: string;
  form?: Partial<OrderFormData>;
  existingAdditionalInfo?: string;
} = {}): Promise<any> {
  try {
    const { message, staffType = 'DCE', form, existingAdditionalInfo = '' } = body;
    if (!message) return { error: 'Message is required' };

    if (!apiKey) {
      const expanded = expandVietnameseShorthand(message);
      const updatedInfo = existingAdditionalInfo ? `${existingAdditionalInfo}; ${expanded}` : expanded;
      return {
        extracted_info: expanded,
        updated_additional_info: updatedInfo,
        translated_to_staff: expanded,
        reply_to_customer: 'Dạ em cảm ơn anh/chị. Em đã dịch và chuyển ngay thông tin này sang bộ phận điều xe ạ.',
        model_used: 'fallback',
      };
    }

    const prompt = `
Bạn là AI CSKH và biên dịch viên điều phối logistics.
Khách hàng vừa trả lời câu hỏi làm rõ của nhân viên ${staffType}:
"${message}"

Thông tin bổ sung đã có trước đó: "${existingAdditionalInfo || 'Chưa có'}"
Đơn hàng hiện tại:
1) Địa chỉ lấy hàng: ${form?.dia_chi_lay_hang || ''}
2) Địa chỉ giao hàng: ${form?.dia_chi_giao_hang || ''}
3) Thông tin hàng: ${form?.thong_tin_hang || ''}
4) Thời gian giao nhận: ${form?.thoi_gian_giao_nhan || ''}

Nhiệm vụ:
1. "extracted_info": Tóm tắt chính xác thông tin mới khách vừa cung cấp bằng tiếng Việt chuẩn.
2. "updated_additional_info": Gộp thông tin bổ sung cũ và mới thành 1 chuỗi gọn.
3. "translated_to_staff": Dịch sát nghĩa nội dung tin nhắn của khách sang tiếng Việt nghiệp vụ điều vận ngắn gọn để chuyển tiếp cho đối tác ${staffType}.
4. "reply_to_customer": Để chuỗi rỗng "".
`;

    const { data: parsed, model_used } = await callGeminiStructured(prompt, {
      type: Type.OBJECT,
      properties: {
        extracted_info: { type: Type.STRING },
        updated_additional_info: { type: Type.STRING },
        translated_to_staff: { type: Type.STRING },
        reply_to_customer: { type: Type.STRING },
      },
      required: ['extracted_info', 'updated_additional_info', 'translated_to_staff', 'reply_to_customer'],
    });

    return { ...parsed, model_used };
  } catch (err: any) {
    const expanded = expandVietnameseShorthand(body.message || '');
    const updatedInfo = body.existingAdditionalInfo ? `${body.existingAdditionalInfo}; ${expanded}` : expanded;
    return {
      extracted_info: expanded,
      updated_additional_info: updatedInfo,
      translated_to_staff: expanded,
      reply_to_customer: 'Dạ em cảm ơn anh/chị đã bổ sung thông tin. Em chuyển ngay cho điều vận để báo giá cho mình ạ.',
      model_used: 'smart-dispatch-engine',
      quota_exceeded: isGeminiQuotaError(err),
    };
  }
}

export function extractVietnamesePhone(text: string): string | null {
  const spokenMap: Record<string, string> = {
    'không': '0', 'khong': '0', 'một': '1', 'mot': '1', 'mốt': '1',
    'hai': '2', 'ba': '3', 'bốn': '4', 'bon': '4', 'tư': '4', 'tu': '4',
    'năm': '5', 'nam': '5', 'lăm': '5', 'lam': '5', 'sáu': '6', 'sau': '6',
    'bảy': '7', 'bay': '7', 'bẩy': '7', 'tám': '8', 'tam': '8', 'chín': '9', 'chin': '9',
  };

  let normalized = String(text || '');
  normalized = normalized.replace(
    /\b(?:(?:không|khong|một|mot|mốt|hai|ba|bốn|bon|tư|tu|năm|nam|lăm|lam|sáu|sau|bảy|bay|bẩy|tám|tam|chín|chin)\b[\s,.-]*){4,}/gi,
    (seq) => seq.split(/[\s,.-]+/).map((w) => spokenMap[w.toLowerCase()] ?? '').join('')
  );

  const candidates = normalized.match(/(?:\+?84|0)[\s.-]*(?:\d[\s.-]*){8,10}\d|\b(?:\d[\s.-]*){9,11}\b/g);
  if (!candidates) return null;

  for (const raw of candidates) {
    let digits = raw.replace(/[^\d]/g, '');
    if (digits.startsWith('84') && digits.length >= 10 && digits.length <= 11) {
      digits = '0' + digits.slice(2);
    }
    if (digits.length >= 9 && digits.length <= 11) return digits;
  }
  return null;
}

export async function extractPhoneNumber(body: {
  message?: string;
  phoneRole?: 'recipient' | 'sender' | 'driver' | string;
} = {}): Promise<any> {
  try {
    const { message, phoneRole = 'recipient' } = body;
    if (!message) return { error: 'Message is required' };

    const directPhone = extractVietnamesePhone(String(message));
    if (directPhone) {
      return {
        is_valid: true,
        phone_number: directPhone,
        model_used: 'smart-dispatch-engine',
      };
    }

    const roleLabel =
      phoneRole === 'driver' ? 'tài xế' : phoneRole === 'sender' ? 'người gửi' : 'người nhận';
    if (!apiKey) {
      return {
        is_valid: false,
        phone_number: null,
        reply_if_invalid: `Dạ em chưa thấy số điện thoại ${roleLabel} hợp lệ. Anh/chị vui lòng nhắn lại giúp em số điện thoại ${roleLabel} (VD: 0912345678) nhé ạ.`,
        model_used: 'fallback',
      };
    }

    const prompt = `
Bạn là AI CSKH trích xuất số điện thoại tại Việt Nam.
Khách hàng/đối tác vừa nhắn tin để cung cấp số điện thoại ${roleLabel}:
"${message}"

Nhiệm vụ:
1. Trích xuất số điện thoại hợp lệ (9-11 chữ số) vào "phone_number", đặt "is_valid" = true nếu có.
2. Nếu không có, đặt "is_valid" = false và viết "reply_if_invalid" lịch sự hỏi lại số điện thoại ${roleLabel}.
`;

    const { data: parsed, model_used } = await callGeminiStructured(prompt, {
      type: Type.OBJECT,
      properties: {
        is_valid: { type: Type.BOOLEAN },
        phone_number: { type: Type.STRING },
        reply_if_invalid: { type: Type.STRING },
      },
      required: ['is_valid'],
    });

    if (parsed.is_valid && parsed.phone_number) {
      const normalized = extractVietnamesePhone(String(parsed.phone_number)) || String(parsed.phone_number).replace(/[^\d]/g, '');
      if (normalized.length >= 9 && normalized.length <= 11) {
        return { is_valid: true, phone_number: normalized, model_used };
      }
    }

    return {
      is_valid: false,
      phone_number: null,
      reply_if_invalid:
        parsed.reply_if_invalid ||
        `Dạ em chưa nhận được số điện thoại ${roleLabel} hợp lệ. Anh/chị nhắn lại giúp em nhé ạ.`,
      model_used,
    };
  } catch (err: any) {
    const roleLabel =
      body.phoneRole === 'driver' ? 'tài xế' : body.phoneRole === 'sender' ? 'người gửi' : 'người nhận';
    return {
      is_valid: false,
      phone_number: null,
      reply_if_invalid: `Dạ em chưa thấy số điện thoại ${roleLabel} hợp lệ. Anh/chị vui lòng nhắn lại giúp em nhé ạ.`,
      model_used: 'smart-dispatch-engine',
      quota_exceeded: isGeminiQuotaError(err),
    };
  }
}

export function fallbackExtractPaymentParty(message: string): {
  is_valid: boolean;
  payment_party: 'Người gửi thanh toán' | 'Người nhận thanh toán' | null;
  reply_if_invalid?: string;
} {
  const lower = String(message || '').toLowerCase().trim();
  const hasSender =
    /\b(người gửi|bên gửi|đầu gửi|chủ hàng|shop trả|shop thanh toán|mình trả|mình thanh toán|anh trả|anh thanh toán|chị trả|chị thanh toán|em trả|tôi trả|tôi thanh toán|trả trước|gửi trả|sender|shipper|prepaid)\b/i.test(
      lower
    ) || lower === 'gửi';
  const hasReceiver =
    /\b(người nhận|bên nhận|đầu nhận|khách nhận|người mua|thu hộ|cod|ship cod|nhận trả|receiver|recipient|collect)\b/i.test(
      lower
    ) || lower === 'nhận';

  if (hasSender && !hasReceiver) return { is_valid: true, payment_party: 'Người gửi thanh toán' };
  if (hasReceiver && !hasSender) return { is_valid: true, payment_party: 'Người nhận thanh toán' };
  return {
    is_valid: false,
    payment_party: null,
    reply_if_invalid:
      'Dạ anh/chị xác nhận rõ giúp em là người gửi hay người nhận thanh toán tiền cước ạ?',
  };
}

export async function extractPaymentParty(body: { message?: string } = {}): Promise<any> {
  try {
    const { message } = body;
    if (!message) return { error: 'Message is required' };

    const direct = fallbackExtractPaymentParty(String(message));
    if (direct.is_valid && direct.payment_party) {
      return { ...direct, model_used: 'smart-dispatch-engine' };
    }

    if (!apiKey) return { ...direct, model_used: 'fallback' };

    const prompt = `
Bạn là AI CSKH điều phối vận tải.
Khách hàng vừa trả lời câu hỏi "Bên nào thanh toán tiền cước (người gửi hay người nhận)?":
"${message}"

Nhiệm vụ:
1. Phân loại "payer" thành "SENDER", "RECEIVER", hoặc "UNKNOWN".
2. Nếu "UNKNOWN": viết "reply_if_invalid" lịch sự hỏi lại.
`;

    const { data: parsed, model_used } = await callGeminiStructured(prompt, {
      type: Type.OBJECT,
      properties: {
        payer: { type: Type.STRING },
        reply_if_invalid: { type: Type.STRING },
      },
      required: ['payer', 'reply_if_invalid'],
    });

    if (parsed.payer === 'SENDER') {
      return { is_valid: true, payment_party: 'Người gửi thanh toán', model_used };
    }
    if (parsed.payer === 'RECEIVER') {
      return { is_valid: true, payment_party: 'Người nhận thanh toán', model_used };
    }

    return {
      is_valid: false,
      payment_party: null,
      reply_if_invalid:
        parsed.reply_if_invalid ||
        'Dạ anh/chị xác nhận rõ giúp em là người gửi hay người nhận thanh toán tiền cước ạ?',
      model_used,
    };
  } catch (err: any) {
    return {
      ...fallbackExtractPaymentParty(String(body.message || '')),
      model_used: 'smart-dispatch-engine',
      quota_exceeded: isGeminiQuotaError(err),
    };
  }
}

export function fallbackExtractPaymentTime(message: string): {
  is_valid: boolean;
  payment_time: 'Thanh toán lúc gửi hàng' | 'Thanh toán sau khi nhận hàng' | null;
  reply_if_invalid?: string;
} {
  const lower = String(message || '').toLowerCase().trim();
  const hasAtSend =
    /\b(lúc gửi|khi gửi|lúc gởi|khi gởi|gửi hàng trả|gửi trả luôn|lúc lấy hàng|khi lấy hàng|lúc bàn giao|trả trước|thanh toán trước|chuyển khoản trước|ck trước|đầu gửi|lúc xuất phát|trước khi đi|prepaid|chuyển khoản|vietqr|qr)\b/i.test(
      lower
    ) ||
    lower === 'lúc gửi' ||
    lower === 'gửi hàng';
  const hasAfterReceive =
    /\b(sau khi nhận|lúc nhận|khi nhận|nhận hàng|nhận xong|giao xong|nhận rồi trả|nhận hàng mới trả|thu hộ|cod|thanh toán sau|trả sau|đầu nhận|lúc phát hàng|khi phát hàng|after delivery|on delivery)\b/i.test(
      lower
    ) || lower === 'nhận hàng';

  if (hasAtSend && !hasAfterReceive) return { is_valid: true, payment_time: 'Thanh toán lúc gửi hàng' };
  if (hasAfterReceive && !hasAtSend) return { is_valid: true, payment_time: 'Thanh toán sau khi nhận hàng' };
  return {
    is_valid: false,
    payment_time: null,
    reply_if_invalid:
      'Dạ anh/chị xác nhận rõ giúp em là thanh toán tiền cước lúc gửi hàng hay sau khi nhận hàng ạ?',
  };
}

export async function extractPaymentTime(body: { message?: string } = {}): Promise<any> {
  try {
    const { message } = body;
    if (!message) return { error: 'Message is required' };

    const direct = fallbackExtractPaymentTime(String(message));
    if (direct.is_valid && direct.payment_time) {
      return { ...direct, model_used: 'smart-dispatch-engine' };
    }

    if (!apiKey) return { ...direct, model_used: 'fallback' };

    const prompt = `
Bạn là AI CSKH điều phối vận tải.
Khách hàng vừa trả lời câu hỏi "Thời điểm thanh toán tiền cước (lúc gửi hàng hay sau khi nhận hàng)?":
"${message}"

Nhiệm vụ:
1. Phân loại "timing" thành "AT_PICKUP", "AFTER_DELIVERY", hoặc "UNKNOWN".
2. Nếu "UNKNOWN": viết "reply_if_invalid" lịch sự hỏi lại.
`;

    const { data: parsed, model_used } = await callGeminiStructured(prompt, {
      type: Type.OBJECT,
      properties: {
        timing: { type: Type.STRING },
        reply_if_invalid: { type: Type.STRING },
      },
      required: ['timing', 'reply_if_invalid'],
    });

    if (parsed.timing === 'AT_PICKUP') {
      return { is_valid: true, payment_time: 'Thanh toán lúc gửi hàng', model_used };
    }
    if (parsed.timing === 'AFTER_DELIVERY') {
      return { is_valid: true, payment_time: 'Thanh toán sau khi nhận hàng', model_used };
    }

    return {
      is_valid: false,
      payment_time: null,
      reply_if_invalid:
        parsed.reply_if_invalid ||
        'Dạ anh/chị xác nhận rõ giúp em là thanh toán tiền cước lúc gửi hàng hay sau khi nhận hàng ạ?',
      model_used,
    };
  } catch (err: any) {
    return {
      ...fallbackExtractPaymentTime(String(body.message || '')),
      model_used: 'smart-dispatch-engine',
      quota_exceeded: isGeminiQuotaError(err),
    };
  }
}
