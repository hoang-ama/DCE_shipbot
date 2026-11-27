import { chatbotAI } from '../../config/chatbot-ai';
import type { AITraceStep, LegacyAITrace } from '../../shared/types';
import { contextHistory } from '../memory';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { ORDER_CONFIRMATION_CLOSING_PHRASE, checkHasWardCommune, chooseNextQuestionKey, cleanAddressText, cleanResponseText, countKeyAsksInHistory, detectCargoCategory, detectDeliveryTime, evaluateCompleteness, formatOrderConfirmationForm, generateNaturalVietnameseReply, generateTrackingCode, isCustomerConfirmation, isGenericCargoWord, isNotValidAddress, normalizeForDedup, reverseGeocodeAddress, smartExtractVietnamese } from '../extraction/express';
import { geminiState } from '../models/gemini';
import { SYSTEM_INSTRUCTION } from '../prompts/express';

export async function expandGoogleMapsShortLinks(text: string): Promise<string> {
  const shortLinkRegex = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/[a-zA-Z0-9_\-]+/g;
  const matches = text.match(shortLinkRegex);
  if (!matches || matches.length === 0) return text;

  let expandedText = text;
  for (const url of matches) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.url && res.url !== url) {
        expandedText = expandedText.replace(url, res.url);
      }
    } catch {
      // ignore network errors or timeouts
    }
  }
  return expandedText;
}

export async function processChatPipeline(
  rawMessage: string,
  history: any[] = [],
  currentInfo: any = {}
): Promise<{
  reply: string;
  shippingInfo: any;
  quickReplies: string[];
  legacyTrace?: LegacyAITrace;
}> {
  const traceSteps: AITraceStep[] = [];
  let geminiReason = 'GEMINI_NOT_CALLED';

  if (!rawMessage || typeof rawMessage !== 'string') {
    return {
      legacyTrace: { source: 'rule', reason: 'EMPTY_MESSAGE', steps: [{ node: 'legacy_rule', status: 'ok', reason: 'EMPTY_MESSAGE' }] },
      reply: 'Em chào anh/chị ạ! Bên em chuyên dịch vụ vận chuyển hỏa tốc, giao nhận tận nơi toàn quốc. Anh/chị vui lòng gửi em xin thông tin địa chỉ lấy và giao hàng nhé!',
      shippingInfo: currentInfo || {},
      quickReplies: [],
    };
  }

  // Auto-expand any Google Maps short links if present
  const message = await expandGoogleMapsShortLinks(rawMessage);

  // Check if confirmation form was previously sent or order was complete, and user confirms
  const botMsgs = (history || [])
    .filter((h: any) => h.role === 'model' || h.role === 'assistant' || h.sender === 'bot')
    .map((h: any) => h.content || h.text || '');
  const lastBotMsg = botMsgs[botMsgs.length - 1] || '';
  const secondLastBotMsg = botMsgs[botMsgs.length - 2] || '';

  const isFormPreviouslySent =
    Boolean(currentInfo?.isComplete) ||
    lastBotMsg.includes('xác nhận giúp em') ||
    lastBotMsg.includes('1) Địa chỉ lấy hàng') ||
    lastBotMsg.includes('Dạ em đã nhận đủ thông tin') ||
    secondLastBotMsg.includes('xác nhận giúp em') ||
    secondLastBotMsg.includes('1) Địa chỉ lấy hàng');

  const isConfirm = isCustomerConfirmation(rawMessage);
  const isCorrection = /(?:không\s*(?:phải|đúng|chuẩn|chính\s*xác|được)|sai\s*(?:rồi|địa\s*chỉ|thông\s*tin)?|nhầm|sửa|thay\s*đổi|chỉnh\s*lại|đổi\s*(?:lại|thành|sang)|sao\s*lại|tại\s*sao)\b/i.test(rawMessage);

  if (isFormPreviouslySent && isConfirm && !isCorrection) {
    const code = currentInfo?.trackingCode || generateTrackingCode();
    const confirmedInfo = {
      ...(currentInfo || {}),
      trackingCode: code,
      isComplete: true,
      isConfirmed: true,
    };
    return {
      legacyTrace: { source: 'rule', reason: 'LEGACY_CONFIRMATION', steps: [{ node: 'legacy_rule', status: 'ok', reason: 'LEGACY_CONFIRMATION' }] },
      reply: ORDER_CONFIRMATION_CLOSING_PHRASE,
      shippingInfo: confirmedInfo,
      quickReplies: [],
    };
  }

  // Pre-extract with fast NLP parser first
  const fastExtracted = smartExtractVietnamese(message, currentInfo);
  if (fastExtracted.sender?.address) {
    const sGeo = reverseGeocodeAddress(fastExtracted.sender.address);
    if (sGeo.hasWardCommune) {
      fastExtracted.sender.address = sGeo.address;
      fastExtracted.sender.hasWardCommune = true;
    } else {
      fastExtracted.sender.hasWardCommune = checkHasWardCommune(fastExtracted.sender.address);
    }
  }
  if (fastExtracted.receiver?.address) {
    const rGeo = reverseGeocodeAddress(fastExtracted.receiver.address);
    if (rGeo.hasWardCommune) {
      fastExtracted.receiver.address = rGeo.address;
      fastExtracted.receiver.hasWardCommune = true;
    } else {
      fastExtracted.receiver.hasWardCommune = checkHasWardCommune(fastExtracted.receiver.address);
    }
  }

  traceSteps.push({ node: 'legacy_extract', status: 'ok' });

  if (!geminiState.ai) {
    const evalResult = evaluateCompleteness(fastExtracted);
    const chosenKey = chooseNextQuestionKey(evalResult, history, message);
    if (chosenKey) {
      evalResult.nextMissingKey = chosenKey;
    }
    const askCounts = countKeyAsksInHistory(history);
    const repeatCount = chosenKey ? askCounts[chosenKey] || 0 : 0;
    let reply = '';

    // Clean internal flags before response
    const { _invalidSenderPhone, _invalidReceiverPhone, ...cleanShippingInfo } = fastExtracted;

    if ((isFormPreviouslySent || currentInfo?.isComplete) && isConfirm && !isCorrection) {
      const code = cleanShippingInfo?.trackingCode || currentInfo?.trackingCode || generateTrackingCode();
      cleanShippingInfo.trackingCode = code;
      cleanShippingInfo.isComplete = true;
      cleanShippingInfo.isConfirmed = true;
      reply = ORDER_CONFIRMATION_CLOSING_PHRASE;
    } else if (evalResult.isComplete) {
      reply = formatOrderConfirmationForm(cleanShippingInfo);
    } else {
      reply = generateNaturalVietnameseReply(cleanShippingInfo, chosenKey, repeatCount);
      if (lastBotMsg && normalizeForDedup(reply) === normalizeForDedup(lastBotMsg)) {
        reply = generateNaturalVietnameseReply(cleanShippingInfo, chosenKey, Math.max(1, repeatCount + 1));
      }
    }

    return {
      legacyTrace: { source: 'rule_fallback', reason: 'GEMINI_NO_CLIENT', steps: [...traceSteps, { node: 'gemini', status: 'skip', reason: 'GEMINI_NO_CLIENT' }, { node: 'legacy_reply', status: 'ok' }] },
      reply,
      shippingInfo: {
        ...cleanShippingInfo,
        ...evalResult,
      },
      quickReplies: [],
    };
  }

  try {
    const prompt = `
Thông tin đơn hàng đã thu thập trước tin nhắn này:
${JSON.stringify(currentInfo || {}, null, 2)}

Thông tin bóc tách sơ bộ từ tin nhắn mới nhất:
${JSON.stringify(fastExtracted, null, 2)}

Lịch sử trò chuyện gần nhất:
${JSON.stringify(contextHistory(history), null, 2)}

Tin nhắn mới nhất của khách hàng:
"${message}"

NHIỆM VỤ CỦA CSKH ĐI CHUNG:
1. Phân tích tin nhắn của khách và trích xuất/cập nhật thông tin:
   - sender: address (có phường/xã), hasWardCommune, name nếu có, phone nếu khách chủ động cung cấp.
   - receiver: address (có phường/xã), hasWardCommune, name nếu có, phone nếu khách chủ động cung cấp.
   - cargo: name (TÊN LOẠI HÀNG: Tài liệu, Hoa quả, Quần áo, Đồ gia dụng...), weight, weightKg, dimensions (length, width, height, raw), category, specialNotes.
   - deliveryTime: thời gian giao nhận dạng text (ví dụ: "Sáng mai", "Chiều nay 15h", "Trong ngày hoặc sang hôm sau", "Trong giờ hành chính", "Giao ngay"...).
2. QUY ĐỊNH BẮT BUỘC: DỊCH NGƯỢC ĐỊA CHỈ TỪ CÂU TRẢ LỜI CỦA KHÁCH:
   - Dịch ngược (Reverse Geocode) các điểm mốc, tòa nhà, bến xe, bệnh viện, trường học, tuyến đường nổi tiếng (ví dụ: Keangnam, Landmark 81, Cầu Giấy, Chợ Bến Thành, 45 Lê Duẩn...) thành địa chỉ chi tiết đầy đủ Phường/Xã.
   - Hiểu văn phong vùng miền: "Từ [A] xuống/lên/ra/về/sang/vào [B]" => [A] là điểm lấy hàng (sender.address), [B] là điểm giao hàng (receiver.address).
   - TUYỆT ĐỐI KHÔNG ĐƯỢC ĐỂ TỪ "tôi muốn", "mình cần", "em muốn", "gửi hàng từ" hay các cụm từ thời gian ("qua lấy, giao trong ngày", "hôm sau cũng đc") VÀO ĐỊA CHỈ!
   - Đặt hasWardCommune: true và TUYỆT ĐỐI KHÔNG HỎI LẠI ĐỊA CHỈ ĐÃ DỊCH ĐƯỢC!
   - CHỈ HỎI LẠI ĐỊA CHỈ KHI TUYỆT ĐỐI KHÔNG THỂ DỊCH NGƯỢC ĐƯỢC (ví dụ khách chỉ nói chung chung: "Hà Nội", "Đà Nẵng", "ở Cầu Giấy", "ở Quận 1").
3. QUY ĐỊNH VỀ THÔNG TIN HÀNG HÓA (TÊN HÀNG BẮT BUỘC LÀ TÊN LOẠI HÀNG):
   - Tên hàng BẮT BUỘC là TÊN LOẠI HÀNG: "Hoa quả", "Tài liệu", "Quần áo", "Thực phẩm", "Hải sản", "Đồ gia dụng", "Linh kiện điện tử", "Mỹ phẩm", "Dược phẩm"...
   - Các món đồ gia dụng / vật dụng ngắn (VD: "đèn", "bàn", "ghế", "loa", "tủ", "nồi", "bếp") => BẮT BUỘC ghi nhận thành "Đồ gia dụng" (hoặc đúng tên mặt hàng khách nhắn nếu đặc thù), TUYỆT ĐỐI KHÔNG bỏ sót để rồi hỏi lại!
   - TUYỆT ĐỐI KHÔNG GÁN TÊN HÀNG LÀ 'hàng', 'đơn hàng', 'kiện hàng', 'hàng hóa', 'đồ'. Đây là danh từ chung.
   - Thông tin hàng gồm 3 trường: Tên hàng, Khối lượng (kg), Kích thước (DxRxC cm). PHẢI NHẬN ĐƯỢC ÍT NHẤT 2 TRÊN 3 TRƯỜNG MỚI PASS!
   - Khi khách vừa cung cấp thông tin hàng mới, ghi nhận ngắn gọn: "Dạ em đã ghi nhận kiện [Tên hàng] ([Khối lượng]) rồi ạ." trước khi hỏi tiếp.
4. THỜI GIAN GIAO NHẬN (TEXT) - QUY ĐỊNH BẮT BUỘC:
   - TỪ "GẤP" CHỈ LÀ TÂM LÝ KHÁCH HÀNG, TUYỆT ĐỐI KHÔNG PHẢI LÀ THỜI GIAN GIAO NHẬN CỤ THỂ -> để deliveryTime: "".
   - Các câu như "Qua lấy, giao trong ngày hoặc sang hôm sau cũng đc", "sáng mai", "trong ngày" => gán vào deliveryTime ("Trong ngày hoặc sang hôm sau"), TUYỆT ĐỐI KHÔNG đưa vào sender.address hay receiver.address!
5. QUY ĐỊNH PHẢN HỒI (GIỐNG NGƯỜI THẬT, BỚT "DẠ", KHÔNG LẶP NGUYÊN VĂN):
   - HẠN CHẾ TỪ "DẠ": Không mở đầu câu hỏi bằng "Dạ". CHỈ dùng "Dạ" khi xác nhận/ghi nhận thông tin mới khách vừa cung cấp.
   - KHÔNG LẶP LẠI TỪNG TỪ MỘT CÂU HỎI ĐÃ HỎI Ở LƯỢT TRƯỚC: Nếu hỏi lại cùng một mục lần 2, phải đổi sang câu tự nhiên: "Hiện em vẫn chưa có thông tin ..., anh/chị vui lòng cung cấp để em tiếp tục tư vấn nhé."
   - LINH HOẠT: Nếu khách chưa cung cấp địa chỉ ngay sau khi hỏi, chuyển sang hỏi thông tin hàng hóa trước thay vì cứ ép hỏi địa chỉ làm khách khó chịu.
   - BỎ HOÀN TOÀN CÁC PHẦN ĐỆM ("để bên em hỗ trợ mình ạ"...) và quickReplies luôn là [].
6. SAU KHI THU THẬP ĐỦ 4 THÔNG TIN THÌ CONFIRM BẰNG FORM (BẮT BUỘC TÁCH CÁC TRƯỜNG THÔNG TIN 1 2 3 4 MỖI TRƯỜNG 1 DÒNG RIÊNG BIỆT BẰNG KÝ TỰ XUỐNG DÒNG \n):
   Dạ em đã nhận đủ thông tin đơn hàng, anh/chị xác nhận giúp em để em báo giá cho mình ạ:
   1) Địa chỉ lấy hàng: [Địa chỉ lấy hàng chi tiết]
   2) Địa chỉ giao hàng: [Địa chỉ giao hàng chi tiết]
   3) Thông tin hàng: [Tên loại hàng, khối lượng, kích thước]
   4) Thời gian giao nhận: [Thời gian giao nhận]
7. NGUYÊN TẮC BẮT BUỘC: HIỂU TOÀN BỘ NGỮ CẢNH CÂU TIẾNG VIỆT (TUYỆT ĐỐI KHÔNG BÓC TÁCH WORD-BY-WORD):
   - Đóng vai trò là CSKH người Việt Nam am hiểu văn phong bản địa:
   - Các cụm từ như "chưa đến 1kg", "chưa tới 1kg", "dưới 2kg", "tầm 1kg đến 2kg": Từ "đến" ở đây mang nghĩa so sánh số lượng ("chưa đến" = nhỏ hơn/dưới), KHÔNG PHẢI chỉ điểm đến giao hàng!
   - BẮT BUỘC gán "chưa đến 1kg" vào khối lượng hàng hóa cargo.weight ("< 1kg" hoặc "Chưa đến 1kg"), weightKg: 1.
   - TUYỆT ĐỐI KHÔNG ĐƯỢC ĐƯA "1kg" hay bất kỳ từ ngữ khối lượng, kích thước, tên loại hàng, thời gian vào địa chỉ sender.address hay receiver.address! Địa chỉ chỉ được là địa danh, đường phố, phường/xã, quận/huyện, tỉnh/thành thực tế.
8. BƯỚC XÁC NHẬN ĐƠN HÀNG VÀ BÁO GIÁ (HIỂU MỌI NGỮ CẢNH VĂN PHONG TIẾNG VIỆT):
   - Sau khi form xác nhận đã được gửi (hoặc đơn đã đủ 4 thông tin: 1) Địa chỉ lấy hàng, 2) Địa chỉ giao hàng, 3) Thông tin hàng, 4) Thời gian giao nhận):
   - BẠN BẮT BUỘC PHẢI THẤU HIỂU MỌI NGỮ CẢNH VĂN PHONG TIẾNG VIỆT KHI KHÁCH HÀNG XÁC NHẬN.
   - Bất kỳ câu nào mang ý nghĩa đồng ý, chốt đơn, xác nhận, hoặc yêu cầu báo giá/tính cước như:
     * Nhóm xác nhận: "anh xác nhận nhé", "chị xác nhận nhé em", "mình xác nhận nhé", "anh confirm nhé", "xác nhận đơn này giúp anh"...
     * Nhóm báo giá / hỏi giá: "báo giá giúp anh", "báo giá giúp chị", "em báo giá giúp anh với", "báo giá cho mình nhé", "cho anh xin báo giá", "tính cước giúp mình", "check giá giúp anh", "xem hết bao nhiêu tiền em", "tính tiền giúp chị"...
     * Nhóm đúng / chuẩn: "đúng rồi em", "chuẩn rồi em", "thông tin đúng rồi", "chuẩn luôn em", "thấy đúng rồi đó", "chính xác rồi em", "đúng hết rồi em"...
     * Nhóm ok / đồng ý / lên đơn: "ok em", "oke em ơi", "okie shop", "được rồi em", "đồng ý nhé", "nhất trí em ơi", "lên đơn giúp anh", "chốt đơn nhé em", "tiến hành đi em"...
   => Đặt isCustomerConfirmed: true và CSKH BẮT BUỘC chốt đúng câu duy nhất:
   "Anh/ chị đợi chút em báo giá cho mình ạ"
   (Trừ khi khách hàng yêu cầu sửa đổi thông tin cụ thể như sửa địa chỉ, sửa khối lượng thì mới cập nhật và gửi lại form xác nhận).
`;

    const RESPONSE_SCHEMA = {
      type: Type.OBJECT,
      properties: {
        reply: {
          type: Type.STRING,
          description: 'Lời phản hồi của CSKH Đi Chung: ghi nhận và hỏi đúng 1 câu còn thiếu tiếp theo',
        },
        isCustomerConfirmed: {
          type: Type.BOOLEAN,
          description: 'True nếu khách hàng đồng ý, xác nhận đơn, hoặc yêu cầu báo giá/tính cước',
        },
        sender: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: 'Tên người gửi hàng nếu có' },
            phone: { type: Type.STRING, description: 'SĐT người gửi nếu có' },
            address: { type: Type.STRING, description: 'Địa chỉ lấy hàng (kèm phường/xã nếu dịch được)' },
            hasWardCommune: { type: Type.BOOLEAN, description: 'True nếu địa chỉ có hoặc đã dịch được chính xác đến cấp Phường/Xã/Thị trấn' },
          },
          required: ['address', 'hasWardCommune'],
        },
        receiver: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: 'Tên người nhận hàng nếu có' },
            phone: { type: Type.STRING, description: 'SĐT người nhận nếu có' },
            address: { type: Type.STRING, description: 'Địa chỉ giao hàng (kèm phường/xã nếu dịch được)' },
            hasWardCommune: { type: Type.BOOLEAN, description: 'True nếu địa chỉ có hoặc đã dịch được chính xác đến cấp Phường/Xã/Thị trấn' },
          },
          required: ['address', 'hasWardCommune'],
        },
        cargo: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: 'Tên LOẠI HÀNG (Tài liệu, Hoa quả, Quần áo, Thực phẩm, Hải sản, Đồ gia dụng, Linh kiện điện tử, Mỹ phẩm...)' },
            weight: { type: Type.STRING, description: 'Khối lượng kèm đơn vị (vd: 5kg, 350g)' },
            weightKg: { type: Type.NUMBER, description: 'Khối lượng quy ra kg dạng số' },
            dimensions: {
              type: Type.OBJECT,
              properties: {
                length: { type: Type.NUMBER, description: 'Chiều dài (cm)' },
                width: { type: Type.NUMBER, description: 'Chiều rộng (cm)' },
                height: { type: Type.NUMBER, description: 'Chiều cao (cm)' },
                raw: { type: Type.STRING, description: 'Chuỗi kích thước gốc, vd 30x20x15 cm' },
              },
            },
            category: { type: Type.STRING, description: 'Phân loại hàng hóa' },
            specialNotes: { type: Type.STRING, description: 'Ghi chú đặc biệt hoặc tên cụ thể mặt hàng' },
          },
          required: ['name', 'weight', 'dimensions'],
        },
        deliveryTime: {
          type: Type.STRING,
          description: 'Thời gian giao nhận hàng dạng văn bản (ví dụ: Sáng mai, Chiều nay 15h, Trong giờ hành chính...)',
        },
        nextFieldToAsk: {
          type: Type.STRING,
          description: 'Tên câu hỏi hoặc trường duy nhất đang được hỏi trong câu phản hồi',
        },
        quickReplies: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Mảng rỗng []',
        },
      },
      required: ['reply', 'sender', 'receiver', 'cargo', 'quickReplies'],
    };

    let response: any = null;
    const geminiStarted = Date.now();
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), chatbotAI.gemini.timeoutMs)
      );

      const geminiPromise = geminiState.ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.1,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      });

      response = await Promise.race([geminiPromise, timeoutPromise]);
    } catch (error) {
      geminiReason = error instanceof Error && error.message === 'timeout' ? 'GEMINI_TIMEOUT' : 'GEMINI_REQUEST_ERROR';
    }

    let parsed: any = {};
    if (response && response.text) {
      try {
        parsed = JSON.parse(response.text.trim());
        geminiReason = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? 'GEMINI_JSON_RECEIVED' : 'GEMINI_INVALID_JSON';
      } catch {
        geminiReason = 'GEMINI_INVALID_JSON';
        parsed = fastExtracted;
      }
    } else {
      if (geminiReason === 'GEMINI_NOT_CALLED') geminiReason = 'GEMINI_EMPTY_RESPONSE';
      parsed = fastExtracted;
    }
    traceSteps.push({ node: 'gemini', status: geminiReason === 'GEMINI_JSON_RECEIVED' ? 'ok' : 'error', reason: geminiReason, elapsedMs: Date.now() - geminiStarted });

    // Merge data seamlessly with currentInfo fallback: Prioritize Gemini semantic extraction over regex
    let rawSAddr = '';
    let rawRAddr = '';

    if (response && response.text && parsed) {
      const pS = parsed.sender?.address ? cleanAddressText(parsed.sender.address) : '';
      const pR = parsed.receiver?.address ? cleanAddressText(parsed.receiver.address) : '';

      rawSAddr = (!isNotValidAddress(pS) ? pS : '') ||
        (!isNotValidAddress(fastExtracted.sender?.address) ? cleanAddressText(fastExtracted.sender?.address) : '') ||
        cleanAddressText(currentInfo?.sender?.address || '');

      rawRAddr = (!isNotValidAddress(pR) ? pR : '') ||
        (!isNotValidAddress(fastExtracted.receiver?.address) ? cleanAddressText(fastExtracted.receiver?.address) : '') ||
        cleanAddressText(currentInfo?.receiver?.address || '');
    } else {
      rawSAddr = (!isNotValidAddress(fastExtracted.sender?.address) ? cleanAddressText(fastExtracted.sender?.address) : '') ||
        cleanAddressText(currentInfo?.sender?.address || '');
      rawRAddr = (!isNotValidAddress(fastExtracted.receiver?.address) ? cleanAddressText(fastExtracted.receiver?.address) : '') ||
        cleanAddressText(currentInfo?.receiver?.address || '');
    }

    // Prevent duplicate address being assigned to both sender and receiver when only one was provided
    if (rawSAddr && rawRAddr && rawSAddr.toLowerCase() === rawRAddr.toLowerCase()) {
      const msgHasSenderIntent = /(?:^|\s+)(?:lấy|gửi\s+từ|từ)\b/i.test(message);
      const msgHasReceiverIntent = /(?:^|\s+)(?:giao|gửi\s+(?:đến|cho|tới)|nhận|đến|tới|sang|vào|về)\b/i.test(message);

      if (msgHasSenderIntent && !msgHasReceiverIntent) {
        rawRAddr = cleanAddressText(currentInfo?.receiver?.address || '');
      } else if (msgHasReceiverIntent && !msgHasSenderIntent) {
        rawSAddr = cleanAddressText(currentInfo?.sender?.address || '');
      } else if (currentInfo?.sender?.address && !currentInfo?.receiver?.address) {
        rawRAddr = cleanAddressText(parsed.receiver?.address || fastExtracted.receiver?.address || '');
      }
    }

    // Reverse geocode addresses if needed, but NEVER overwrite if address already has full ward/commune
    const sHasExistingWard = /(?:phường|p\.|xã|x\.|thị trấn|tt\.)\s+[a-zà-ỹ0-9]+/i.test(rawSAddr);
    const rHasExistingWard = /(?:phường|p\.|xã|x\.|thị trấn|tt\.)\s+[a-zà-ỹ0-9]+/i.test(rawRAddr);

    const sGeo = sHasExistingWard ? { address: rawSAddr, hasWardCommune: true } : reverseGeocodeAddress(rawSAddr);
    const rGeo = rHasExistingWard ? { address: rawRAddr, hasWardCommune: true } : reverseGeocodeAddress(rawRAddr);

    const sAddr = sGeo.address || rawSAddr;
    const rAddr = rGeo.address || rawRAddr;

    // Determine hasWardCommune: true if AI flagged true or reverse geocode resolved or regex found ward/commune
    const sHasWard = Boolean(sGeo.hasWardCommune || parsed.sender?.hasWardCommune || checkHasWardCommune(sAddr) || currentInfo?.sender?.hasWardCommune);
    const rHasWard = Boolean(rGeo.hasWardCommune || parsed.receiver?.hasWardCommune || checkHasWardCommune(rAddr) || currentInfo?.receiver?.hasWardCommune);

    // Ensure addresses are not invalid phrases (like "anh cần" or delivery times)
    const finalSAddr = isGenericCargoWord(sAddr) || isNotValidAddress(sAddr) ? '' : sAddr;
    const finalRAddr = isGenericCargoWord(rAddr) || isNotValidAddress(rAddr) ? '' : rAddr;

    const mergedSender = {
      name: parsed.sender?.name?.trim() || fastExtracted.sender?.name || currentInfo?.sender?.name || '',
      phone: parsed.sender?.phone?.trim() || fastExtracted.sender?.phone || currentInfo?.sender?.phone || '',
      address: finalSAddr,
      hasWardCommune: finalSAddr ? sHasWard : false,
    };

    const mergedReceiver = {
      name: parsed.receiver?.name?.trim() || fastExtracted.receiver?.name || currentInfo?.receiver?.name || '',
      phone: parsed.receiver?.phone?.trim() || fastExtracted.receiver?.phone || currentInfo?.receiver?.phone || '',
      address: finalRAddr,
      hasWardCommune: finalRAddr ? rHasWard : false,
    };

    let dimRaw = parsed.cargo?.dimensions?.raw?.trim() || fastExtracted.cargo?.dimensions?.raw || '';
    const l = parsed.cargo?.dimensions?.length ?? fastExtracted.cargo?.dimensions?.length ?? null;
    const w = parsed.cargo?.dimensions?.width ?? fastExtracted.cargo?.dimensions?.width ?? null;
    const h = parsed.cargo?.dimensions?.height ?? fastExtracted.cargo?.dimensions?.height ?? null;

    if (!dimRaw && l && w && h) {
      dimRaw = `${l}x${w}x${h} cm`;
    }

    // Normalize cargo name to category (Tên loại hàng: Tài liệu, Hoa quả, Quần áo...)
    let cargoName = parsed.cargo?.name?.trim() || fastExtracted.cargo?.name || '';
    if (isGenericCargoWord(cargoName)) {
      cargoName = '';
    }
    let specialNotes = parsed.cargo?.specialNotes?.trim() || fastExtracted.cargo?.specialNotes || '';

    const catDetected = detectCargoCategory(cargoName) || detectCargoCategory(message) || detectCargoCategory(fastExtracted.cargo?.name);
    if (catDetected) {
      if (cargoName && cargoName.toLowerCase() !== catDetected.toLowerCase() && !specialNotes && !isGenericCargoWord(cargoName)) {
        specialNotes = cargoName;
      }
      cargoName = catDetected;
    }

    const mergedCargo = {
      name: cargoName,
      weight: parsed.cargo?.weight?.trim() || fastExtracted.cargo?.weight || '',
      weightKg: parsed.cargo?.weightKg ?? fastExtracted.cargo?.weightKg ?? null,
      dimensions: {
        length: l,
        width: w,
        height: h,
        raw: dimRaw,
      },
      category: catDetected || parsed.cargo?.category?.trim() || fastExtracted.cargo?.category || 'Bưu phẩm / Hàng tiêu dùng',
      specialNotes,
    };

    let mergedDeliveryTime = parsed.deliveryTime?.trim() || fastExtracted.deliveryTime || detectDeliveryTime(message) || '';
    if (mergedDeliveryTime) {
      const isInvalidGap = /^(?:gấp|cần\s*gấp|gửi\s*gấp|hàng\s*gấp|rất\s*gấp|đi\s*gấp|lấy\s*gấp|giao\s*gấp)$/i.test(mergedDeliveryTime.trim());
      const isAddr =
        /(?:chợ|tòa|landmark|lanmark|keangnam|bitexco|quận|phường|xã|huyện|tỉnh|đường|phố|ngõ|ngách|bến\s*xe|sân\s*bay|hà\s*nội|hồ\s*chí\s*minh|đà\s*nẵng|bến\s*thành)/i.test(mergedDeliveryTime) ||
        checkHasWardCommune(mergedDeliveryTime) ||
        reverseGeocodeAddress(mergedDeliveryTime).hasWardCommune;
      if (isAddr || isInvalidGap) {
        mergedDeliveryTime = '';
      }
    }

    const mergedInfo: any = {
      sender: mergedSender,
      receiver: mergedReceiver,
      cargo: mergedCargo,
      deliveryTime: mergedDeliveryTime,
    };

    const evalResult = evaluateCompleteness(mergedInfo);
    const chosenKey = chooseNextQuestionKey(evalResult, history, message);
    if (chosenKey) {
      evalResult.nextMissingKey = chosenKey;
    }

    const askCounts = countKeyAsksInHistory(history);
    const repeatCount = chosenKey ? askCounts[chosenKey] || 0 : 0;
    const naturalFallback = generateNaturalVietnameseReply(mergedInfo, chosenKey, repeatCount);

    let finalReply = parsed.reply?.trim() || '';

    const userConfirmed = isConfirm || parsed.isCustomerConfirmed === true;
    if ((isFormPreviouslySent || currentInfo?.isComplete) && userConfirmed && !isCorrection) {
      const code = mergedInfo?.trackingCode || currentInfo?.trackingCode || generateTrackingCode();
      mergedInfo.trackingCode = code;
      mergedInfo.isComplete = true;
      mergedInfo.isConfirmed = true;
      finalReply = ORDER_CONFIRMATION_CLOSING_PHRASE;
    } else if (evalResult.isComplete) {
      finalReply = formatOrderConfirmationForm(mergedInfo);
    } else {
      // Enforce rule: If cargo has at least 2 fields, cargo passes -> NEVER ask for cargo again
      const cargoCount = (mergedCargo.name?.trim() ? 1 : 0) + (mergedCargo.weight?.trim() || mergedCargo.weightKg ? 1 : 0) + (mergedCargo.dimensions?.raw?.trim() || mergedCargo.dimensions?.length ? 1 : 0);
      const askedCargoFluff = cargoCount >= 2 && (finalReply.toLowerCase().includes('khối lượng') || finalReply.toLowerCase().includes('kích thước') || finalReply.toLowerCase().includes('cân nặng') || finalReply.toLowerCase().includes('loại hàng'));

      // Nếu hỏi lại lần 2 cùng một mục, ưu tiên dùng mẫu "Hiện em vẫn chưa có thông tin..."
      if (!finalReply || askedCargoFluff || repeatCount >= 1) {
        finalReply = naturalFallback;
      } else {
        // Enforce sequence / target key conformity
        if (chosenKey === 'sender_address' && !/(?:lấy|gửi\s*từ|điểm\s*lấy|địa\s*chỉ\s*lấy)/i.test(finalReply)) {
          finalReply = naturalFallback;
        } else if (chosenKey === 'receiver_address' && !/(?:giao|gửi\s*(?:đến|tới|cho|về)|điểm\s*giao|địa\s*chỉ\s*giao|nhận)/i.test(finalReply)) {
          finalReply = naturalFallback;
        } else if (chosenKey === 'cargo_info' && !/(?:hàng|loại\s*hàng|mặt\s*hàng|khối\s*lượng|kích\s*thước|cân\s*nặng|kiện)/i.test(finalReply)) {
          finalReply = naturalFallback;
        } else if (chosenKey === 'delivery_time' && !/(?:thời\s*gian|hỏa\s*tốc|trong\s*ngày|khi\s*nào|lúc\s*nào|mấy\s*giờ|giao\s*nhận)/i.test(finalReply)) {
          finalReply = naturalFallback;
        }
      }
    }

    // Chỉ ghi nhận tên hàng vừa mới nhận được ở lượt này (không lặp lại ở mọi lượt sau)
    const cName = mergedCargo.name && !isGenericCargoWord(mergedCargo.name) ? mergedCargo.name : '';
    const cWeight = mergedCargo.weight || (mergedCargo.weightKg ? `${mergedCargo.weightKg}kg` : '');
    const cargoJustAdded = Boolean(cName && !currentInfo?.cargo?.name);
    if (cargoJustAdded && !evalResult.isComplete && !finalReply.toLowerCase().includes(cName.toLowerCase()) && repeatCount === 0) {
      const ack = cWeight
        ? `Dạ em đã ghi nhận kiện [${cName}] (${cWeight}) rồi ạ. `
        : `Dạ em đã ghi nhận loại hàng là [${cName}] rồi ạ. `;
      finalReply = ack + finalReply;
    }

    finalReply = cleanResponseText(finalReply);

    // Chống lặp lại nguyên văn câu bot vừa nhắn ngay trước đó
    if (!evalResult.isComplete && lastBotMsg && normalizeForDedup(finalReply) === normalizeForDedup(lastBotMsg)) {
      finalReply = cleanResponseText(generateNaturalVietnameseReply(mergedInfo, chosenKey, Math.max(1, repeatCount + 1)));
    }

    return {
      legacyTrace: { source: geminiReason === 'GEMINI_JSON_RECEIVED' ? 'gemini' : 'rule_fallback', reason: geminiReason, steps: [...traceSteps, { node: 'legacy_reply', status: 'ok' }] },
      reply: finalReply,
      shippingInfo: {
        ...mergedInfo,
        ...evalResult,
      },
      quickReplies: [],
    };
  } catch (error: any) {
    console.warn('Gemini request failed or timed out, using fast smart extractor:', error?.message);

    const { _invalidSenderPhone, _invalidReceiverPhone, ...cleanFastRaw } = fastExtracted;
    const cleanFast: any = { ...cleanFastRaw };
    if (cleanFast.deliveryTime && /^(?:gấp|cần\s*gấp|gửi\s*gấp|hàng\s*gấp|rất\s*gấp|đi\s*gấp|lấy\s*gấp|giao\s*gấp)$/i.test(cleanFast.deliveryTime.trim())) {
      cleanFast.deliveryTime = '';
    }
    const evalResult = evaluateCompleteness(cleanFast);
    const chosenKey = chooseNextQuestionKey(evalResult, history, message);
    if (chosenKey) {
      evalResult.nextMissingKey = chosenKey;
    }
    const askCounts = countKeyAsksInHistory(history);
    const repeatCount = chosenKey ? askCounts[chosenKey] || 0 : 0;
    let reply = '';

    if ((isFormPreviouslySent || currentInfo?.isComplete) && isConfirm && !isCorrection) {
      const code = cleanFast?.trackingCode || currentInfo?.trackingCode || generateTrackingCode();
      cleanFast.trackingCode = code;
      cleanFast.isComplete = true;
      cleanFast.isConfirmed = true;
      reply = ORDER_CONFIRMATION_CLOSING_PHRASE;
    } else if (evalResult.isComplete) {
      reply = formatOrderConfirmationForm(cleanFast);
    } else {
      reply = cleanResponseText(generateNaturalVietnameseReply(cleanFast, chosenKey, repeatCount));
    }

    const cFastName = cleanFast.cargo?.name && !isGenericCargoWord(cleanFast.cargo.name) ? cleanFast.cargo.name : '';
    const cFastWeight = cleanFast.cargo?.weight || (cleanFast.cargo?.weightKg ? `${cleanFast.cargo.weightKg}kg` : '');
    const fastCargoJustAdded = Boolean(cFastName && !currentInfo?.cargo?.name);
    if (fastCargoJustAdded && !evalResult.isComplete && !reply.toLowerCase().includes(cFastName.toLowerCase()) && repeatCount === 0) {
      const ack = cFastWeight
        ? `Dạ em đã ghi nhận kiện [${cFastName}] (${cFastWeight}) rồi ạ. `
        : `Dạ em đã ghi nhận loại hàng là [${cFastName}] rồi ạ. `;
      reply = ack + reply;
    }

    if (!evalResult.isComplete && lastBotMsg && normalizeForDedup(reply) === normalizeForDedup(lastBotMsg)) {
      reply = cleanResponseText(generateNaturalVietnameseReply(cleanFast, chosenKey, Math.max(1, repeatCount + 1)));
    }

    return {
      legacyTrace: { source: 'rule_fallback', reason: 'LEGACY_PROCESSING_ERROR', steps: [...traceSteps, { node: 'legacy_reply', status: 'error', reason: 'LEGACY_PROCESSING_ERROR' }, { node: 'legacy_fallback', status: 'ok' }] },
      reply,
      shippingInfo: {
        ...cleanFast,
        ...evalResult,
      },
      quickReplies: [],
    };
  }
}
