import { resolveAdministrativeAddress, parseGoogleMapsLocation } from '../../shared/data/vnAdministrative';
import { generateShipmentTextSummary, generateTrackingCode } from '../../shared/shipment-format';
export { generateTrackingCode } from '../../shared/shipment-format';

export function cleanResponseText(text: string | undefined | null): string {
  if (!text) return '';
  let s = text
    .replace(/[,.]?\s*để\s+(?:bên\s+)?(?:em|Đi\s*Chung)\s+hỗ\s+trợ\s*(?:mình|anh\/chị|bạn|cho\s+mình|cho\s+anh\/chị)?\s*(?:nhé|ạ|nha|nhé\s+ạ)?[.]?/gi, '.')
    .replace(/[,.]?\s*để\s+(?:bên\s+)?(?:em|Đi\s*Chung)\s+tư\s+vấn\s*(?:cho\s+)?(?:mình|anh\/chị|bạn)?\s*(?:nhé|ạ|nha|nhé\s+ạ)?[.]?/gi, '.')
    .replace(/để\s+bên\s+em\s+hỗ\s+trợ\s*(?:mình)?\s*(?:ạ)?/gi, '');

  // Xóa các câu mở đầu máy móc rập khuôn nếu phía sau đã có câu trả lời tự nhiên
  if (/^Dạ em đã ghi nhận thông tin\.\s*(?:Dạ\s+)?/i.test(s) && s.length > 35) {
    s = s.replace(/^Dạ em đã ghi nhận thông tin\.\s*/i, '');
  }

  // Tách các trường thông tin 1) 2) 3) 4) mỗi trường 1 dòng riêng biệt
  s = s
    .replace(/:\s*(?:1\)|1\.\s*)/g, ':\n1) ')
    .replace(/([^\n])\s*(?:2\)|2\.\s*)/g, '$1\n2) ')
    .replace(/([^\n])\s*(?:3\)|3\.\s*)/g, '$1\n3) ')
    .replace(/([^\n])\s*(?:4\)|4\.\s*)/g, '$1\n4) ');

  // Dọn dẹp khoảng trắng ngang trên từng dòng, tuyệt đối giữ nguyên ký tự xuống dòng (\n)
  s = s
    .split('\n')
    .map((line) => line.replace(/[ \t]+([.,!?])/g, '$1').replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();

  return s;
}

export function isGenericCargoWord(name: string | undefined | null): boolean {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return true;
  const unaccented = removeVietnameseDiacritics(trimmed);

  const genericKeywords = [
    'hàng', 'hang',
    'hàng hóa', 'hang hoa',
    'đơn hàng', 'don hang',
    'kiện hàng', 'kien hang',
    'bưu phẩm', 'buu pham',
    'bưu kiện', 'buu kien',
    'đồ', 'do',
    'mặt hàng', 'mat hang',
    'loại hàng', 'loai hang',
    'kiện', 'kien',
    'gói hàng', 'goi hang',
    'thùng hàng', 'thung hang',
    'sản phẩm', 'san pham',
    'hàng này', 'hang nay',
    'kiện này', 'kien nay',
    'đồ này', 'do nay',
    'đồ đạc', 'do dac',
    'vận chuyển', 'van chuyen',
    'chuyển phát', 'chuyen phat',
  ];

  if (genericKeywords.includes(trimmed) || genericKeywords.includes(unaccented)) {
    return true;
  }

  if (/^(?:hàng|hàng\s+hóa|đơn\s+hàng|kiện\s+hàng|bưu\s+phẩm|bưu\s+kiện|đồ|mặt\s+hàng|sản\s+phẩm|thùng\s+hàng|gói\s+hàng)(?:\s+(?:này|đó|kia|ấy|hóa))?$/i.test(trimmed)) {
    return true;
  }

  return false;
}

export function detectDeliveryTime(text: string | undefined | null): string | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // 1. High priority: "hỏa tốc trong ngày", "giao nhận hỏa tốc trong ngày", "trong ngày luôn", "trong ngày hoặc sang hôm sau"
  if (/(?:giao\s+nhận\s+)?hỏa\s+tốc\s+trong\s+ngày(?:\s+luôn)?/i.test(lower)) {
    return 'Hỏa tốc trong ngày';
  }
  if (/(?:trong\s+ngày|hôm\s+nay)\s+(?:hoặc|hay)\s+(?:sang\s+)?(?:ngày\s+)?(?:hôm\s+sau|mai|ngày\s+mai)/i.test(lower)) {
    return 'Trong ngày hoặc sang hôm sau';
  }
  if (/(?:giao\s+nhận\s+)?hỏa\s+tốc(?:\s+(?:luôn|ngay|nhé|ạ))?/i.test(lower) && !/(?:quận|phường|xã|đường|tòa)/i.test(lower)) {
    if (/(?:trong\s+ngày|hôm\s+nay)/i.test(lower)) {
      return 'Hỏa tốc trong ngày';
    }
    return 'Hỏa tốc';
  }
  if (/(?:giao|nhận)?\s*(?:ngay\s+)?trong\s+ngày(?:\s+(?:luôn|ngay|hôm\s+nay))?/i.test(lower) && !/(?:quận|phường|xã|đường|tòa)/i.test(lower)) {
    return 'Trong ngày';
  }
  if (/(?:trong\s+)?hôm\s+nay(?:\s+(?:luôn|ngay))?/i.test(lower) && !/(?:quận|phường|xã|đường|tòa)/i.test(lower)) {
    return 'Trong hôm nay';
  }
  if (/(?:sang\s+)?(?:ngày\s+)?(?:hôm\s+sau|ngày\s+kia|ngày\s+mốt|cuối\s+tuần)(?:\s+(?:cũng\s+(?:được|đc)|nhé|ạ))?/i.test(lower) && !/(?:quận|phường|xã|đường|tòa)/i.test(lower)) {
    if (/hôm\s+sau/i.test(lower)) return 'Sang hôm sau';
    if (/ngày\s+kia/i.test(lower)) return 'Ngày kia';
    if (/cuối\s+tuần/i.test(lower)) return 'Cuối tuần';
  }

  // Specific prefix pattern with required time preposition
  const prefixMatch = text.match(/(?:giao|nhận)\s+(?:vào\s+|lúc\s+|khoảng\s+|tầm\s+)?((?:sáng|trưa|chiều|tối)?\s*(?:hôm\s*nay|hôm\s*sau|nay|mai|ngày\s*mai|ngày\s*mốt|ngày\s*kia)?\s*(?:lúc|khoảng|tầm)?\s*\d{1,2}(?:h|\s*giờ)(?:\s*\d{1,2}(?:p|phút)?)?|(?:trong\s*)?giờ\s*hành\s*chính|sáng\s*mai|chiều\s*mai|tối\s*mai|trưa\s*mai|sáng\s*nay|chiều\s*nay|tối\s*nay|ngày\s*mai|ngày\s*mốt|ngày\s*kia|sang\s*hôm\s*sau|hôm\s*sau|ngay|luôn|càng\s*sớm\s*càng\s*tốt)/i);
  if (prefixMatch && prefixMatch[1]) {
    const candidate = prefixMatch[1].trim();
    if (!/(?:chợ|tòa|landmark|lanmark|keangnam|bến\s*thành|phường|quận|đường)/i.test(candidate)) {
      return candidate;
    }
  }

  // Common timing keywords
  const keywordMatch = text.match(/\b((?:sáng|trưa|chiều|tối)?\s*(?:hôm\s*nay|hôm\s*sau|nay|mai|ngày\s*mai|ngày\s*mốt|ngày\s*kia|mốt)?\s*(?:lúc|khoảng|tầm)?\s*\d{1,2}(?:h|\s*giờ)(?:\s*\d{1,2}(?:p|phút)?)?|(?:trong\s*)?giờ\s*hành\s*chính|sáng\s*mai|chiều\s*mai|tối\s*mai|trưa\s*mai|sáng\s*nay|chiều\s*nay|tối\s*nay|ngày\s*mai|ngày\s*mốt|ngày\s*kia|sang\s*hôm\s*sau|hôm\s*sau|càng\s*sớm\s*càng\s*tốt|giao\s*ngay|giao\s*luôn|ngay\s*bây\s*giờ|trước\s*\d{1,2}h|sau\s*\d{1,2}h|lúc\s*nào\s*cũng\s*(?:được|đc)|ngày\s*\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?)\b/i);
  if (keywordMatch && keywordMatch[1]) {
    const candidate = keywordMatch[1].trim();
    if (!/(?:chợ|tòa|landmark|lanmark|keangnam|bến\s*thành|phường|quận|đường)/i.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

export const ADDR_KEYWORD_REGEX = /(?:^|[\s,.;:/()?!])(?:số\s+\d+|phố|đường|ngõ|ngách|phường|xã|thị\s*trấn|quận|huyện|tỉnh|thành\s*phố|kđt|tòa|chung\s+cư|chợ|bến|sân\s+bay|học\s+viện|trường|bệnh\s+viện|khu\s+đô\s+thị)(?=$|[\s,.;:/()?!])/i;

export function isUserCorrectionMessage(text: string | undefined | null): boolean {
  if (!text || typeof text !== 'string') return false;
  return /(?:không\s*(?:phải|đúng|chuẩn|chính\s*xác|được)|sai\s*(?:rồi|địa\s*chỉ|thông\s*tin)?|nhầm|sửa|thay\s*đổi|chỉnh\s*lại|đổi\s*(?:lại|thành|sang)|sao\s*lại|tại\s*sao|cập\s*nhật\s*lại)\b/i.test(text);
}

export function isConversationalOrQuestion(text: string | undefined | null): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();

  const hasStrongAddress = /(?:^|[\s,.;:/()])(?:số\s+\d+|phố|đường|ngõ|ngách|phường|xã|thị\s*trấn|quận|huyện|tỉnh|thành\s*phố|kđt|chung\s+cư)(?=$|[\s,.;:/()])/i.test(lower);
  if (hasStrongAddress) return false;

  if (
    /(?:trả\s*(?:phí|tiền|cước)|phí\s*ship|tiền\s*ship|cước\s*(?:phí|xe|vận\s*chuyển)|thu\s*hộ|\bcod\b|chuyển\s*khoản|bao\s*nhiêu\s*(?:tiền|cước)?|mấy\s*tiền|hết\s*(?:bao\s*)?nhiêu|tính\s*cước|báo\s*giá|được\s*(?:k|ko|không|kg)|đc\s*(?:k|ko|không)|đc\s*chưa|nhanh\s*(?:giúp|lên|nhé|nha|với|vs)|giúp\s*(?:em|anh|chị|mình|shop|e)\s*(?:với|vs|nhé|nha)?|chờ\s*(?:chút|tí|xíu)|đợi\s*(?:chút|tí|xíu)|cảm\s*ơn|thank|vâng|dạ\s*(?:vâng|ok|cảm\s*ơn)|\balo\b|chào\s*(?:shop|bạn|em|anh|chị))/i.test(lower)
  ) {
    return true;
  }

  if (/(?:\?\s*$|(?:^|\s)(?:k|ko|không)\s*(?:ạ|nhỉ|nhé|em|anh|chị)?[.!?]*$)/i.test(lower)) {
    return true;
  }

  return false;
}

export function hasExplicitAddressSignal(text: string | undefined | null): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (ADDR_KEYWORD_REGEX.test(trimmed)) return true;
  if (checkHasWardCommune(trimmed)) return true;
  if (trimmed.includes(',')) return true;
  if (/^\d+[a-zA-Z]?(?:\/\d+)*\s+[a-zA-ZÀ-ỹ]/i.test(trimmed)) return true;
  if (resolveAdministrativeAddress(trimmed).hasWardCommune) return true;
  const lower = trimmed.toLowerCase();
  const unaccented = removeVietnameseDiacritics(trimmed);
  for (const item of LANDMARK_REVERSE_GEOCODE) {
    if (item.pattern.test(lower) || item.unaccentedPattern.test(unaccented)) return true;
  }
  return false;
}

export function isNotValidAddress(text: string | undefined | null): boolean {
  if (!text || typeof text !== 'string') return true;
  const cleaned = cleanAddressText(text);
  if (!cleaned || cleaned.length < 3) return true;
  const lower = cleaned.toLowerCase();

  // If text starts with conversational pronouns + verbs: "anh cần", "tôi muốn", etc.
  if (/^(?:anh|em|chị|tôi|mình|bác|chú|cô)\s+(?:cần|muốn|nhờ|hỏi)/i.test(lower)) return true;
  if (isConversationalOrQuestion(cleaned)) return true;

  const hasAddrKeyword = ADDR_KEYWORD_REGEX.test(lower);

  // Pure action / delivery time / consent phrases MUST NEVER be saved as addresses
  // e.g. "qua lấy, giao", "hôm sau cũng đc", "lúc nào cũng được", "ok em", "chưa biết"
  if (!hasAddrKeyword) {
    if (
      /^(?:qua\s+)?(?:giao|nhận|lấy)(?:\s*,?\s*(?:giao|nhận|lấy|hàng))*$/i.test(lower) ||
      /(?:cũng\s+(?:được|đc)|tùy\s+bên\s+em|lúc\s+nào\s+cũng|bao\s+giờ\s+cũng|khi\s+nào\s+cũng)/i.test(lower) ||
      /^(?:giao\s+nhận|giao\s+hàng|nhận\s+hàng|hỏa\s+tốc|trong\s+ngày|luôn|ngay|giao\s+nhận\s+hỏa\s+tốc|hôm\s+sau|sang\s+hôm\s+sau|ngày\s+mai|ngày\s+kia|sáng\s+mai|chiều\s+mai|chưa\s+biết|chưa\s+rõ|không\s+nhớ)$/i.test(lower) ||
      /^(?:nhận\s+hỏa\s+tốc|giao\s+hỏa\s+tốc|hỏa\s+tốc\s+trong\s+ngày|hỏa\s+tốc\s+trong\s+ngày\s+luôn)$/i.test(lower)
    ) {
      return true;
    }
    if (detectDeliveryTime(cleaned)) {
      return true;
    }
  }

  // Weights, dimensions, volumes, quantities or comparison phrases
  // e.g. "1kg", "chưa đến 1kg", "chưa tới 1kg", "dưới 2kg", "tầm 5kg", "500g", "0.5kg", "30x20x10", "1 kiện", "2 thùng"
  if (
    /^(?:chưa\s*(?:đến|tới)|dưới|hơn|khoảng|tầm|tầm\s*khoảng|trên|tối\s*đa|khoảng\s*tầm)?\s*<?\s*\d+(?:[.,]\d+)?\s*(?:kg|kilo|kilogram|cân|lạng|g|gram|tạ|yến|tấn|cm|mm|m)\b/i.test(lower) && !hasAddrKeyword
  ) {
    return true;
  }
  if (/\b\d+(?:[.,]\d+)?\s*(?:kg|kilo|kilogram|cân|lạng|g|gram|tạ|yến|tấn)\b/i.test(lower) && !hasAddrKeyword) {
    return true;
  }
  if (/^\d+\s*[xX*×]\s*\d+(?:\s*[xX*×]\s*\d+)?(?:\s*cm|\s*mm|\s*m)?$/i.test(lower)) {
    return true;
  }
  if (/^\d+\s*(?:kiện|thùng|hộp|gói|tập|cuốn|cái|chiếc|bao|bọc)$/i.test(lower)) {
    return true;
  }

  // Pure cargo name without address keywords (e.g. "tài liệu", "hàng hóa", "giấy tờ", "hoa quả", "quần áo")
  if (isGenericCargoWord(cleaned)) return true;
  if (detectCargoCategory(cleaned) && !hasAddrKeyword) return true;

  return false;
}

export function cleanAddressText(text: string | undefined | null): string {
  if (!text || typeof text !== 'string') return '';
  let s = text.trim();

  // Strip conversational opener phrases
  s = s.replace(/^(?:dạ\s+|vâng\s+|ạ\s+|ơi\s+|alo\s+|xin\s+chào\s+|chào\s+(?:bạn|shop|em|ad)\s+|phiền\s+(?:bạn|shop|em)\s+)?(?:tôi\s+muốn|mình\s+muốn|em\s+muốn|anh\s+muốn|chị\s+muốn|tôi\s+cần|mình\s+cần|em\s+cần|anh\s+cần|chị\s+cần|cho\s+(?:mình|em|tôi)|bên\s+(?:mình|em|tôi)\s+muốn|bên\s+(?:mình|em|tôi)\s+cần|nhờ\s+(?:bạn|shop|em))\s+/gi, '');

  // Strip shipping actions (gửi hàng, chuyển hàng, ship hàng, giao nhận, chuyển, gửi, lấy hàng, giao hàng)
  s = s.replace(/^(?:vận\s+chuyển\s+hàng|chuyển\s+hàng|gửi\s+hàng|ship\s+hàng|giao\s+nhận|chuyển|gửi|ship|đặt\s+đơn|tạo\s+đơn)\s+/gi, '');

  // Strip prepositions (từ, ở, tại, lấy từ, lấy ở, lấy tại, giao đến, giao tới, giao ở, giao tại, đến, tới, sang, vào, về, đi)
  s = s.replace(/^(?:lấy(?:\s+hàng)?(?:\s+(?:ở|tại))?|giao(?:\s+hàng)?(?:\s+(?:đến|tới|ở|tại|vào|sang|về|cho))?|địa\s+chỉ(?:\s+lấy|\s+giao)?(?:\s+hàng)?:?|từ|ở|tại|đến|tới|sang|vào|về|đi)\s+/gi, '');

  // Repeat once to catch chained forms like "anh cần giao nhận từ"
  s = s.replace(/^(?:tôi\s+muốn|mình\s+muốn|em\s+muốn|anh\s+muốn|chị\s+muốn|tôi\s+cần|mình\s+cần|em\s+cần|anh\s+cần|chị\s+cần|gửi\s+hàng|chuyển\s+hàng|giao\s+nhận|chuyển|gửi|từ|ở|tại)\s+/gi, '');

  // Strip trailing cargo / weight or delivery time attached
  s = s.replace(/(?:,\s*|\s+)(?:nặng\s+\d+.*|khối\s+lượng\s+.*|kích\s+thước\s+.*|hỏa\s+tốc.*|trong\s+ngày.*|sáng\s+mai.*|chiều\s+nay.*)$/gi, '');

  s = s.replace(/^[-,.:;]\s*/, '').replace(/\s*[-,.:;]$/, '').trim();

  // If text is purely conversational words, delivery time, shipping speed, pure weight or pure cargo
  if (
    /^(?:tôi\s+muốn|mình\s+muốn|em\s+muốn|anh\s+muốn|chị\s+muốn|tôi\s+cần|mình\s+cần|em\s+cần|anh\s+cần|chị\s+cần|giao\s+nhận|gửi\s+hàng|chuyển\s+hàng|chuyển|gửi|ship|hàng|lấy\s+hàng|giao\s+hàng|alo|dạ|vâng)$/i.test(s) ||
    /^(?:hỏa\s+tốc|nhanh|trong\s+ngày|hôm\s+nay|ngày\s+mai|sáng\s+mai|chiều\s+nay|luôn|ngay|tận\s+nơi)(?:\s+(?:luôn|ngay|trong\s+ngày))?$/i.test(s) ||
    /^(?:nhận\s+)?hỏa\s+tốc(?:\s+trong\s+ngày)?(?:\s+luôn)?$/i.test(s) ||
    /^(?:nhận\s+hỏa\s+tốc\s+trong\s+ngày\s+luôn)$/i.test(s) ||
    /^(?:chưa\s*(?:đến|tới)|dưới|khoảng|tầm)?\s*<?\s*\d+(?:[.,]\d+)?\s*(?:kg|kilo|kilogram|cân|g|gram|tấn)\b/i.test(s) ||
    /^(?:tài\s*liệu|giấy\s*tờ|hồ\s*sơ|hoa\s*quả|quần\s*áo|thực\s*phẩm)$/i.test(s)
  ) {
    return '';
  }

  return s;
}

export function cleanPhoneNumber(raw: string | undefined | null): string {
  if (!raw) return '';
  let cleaned = raw.replace(/[\s.-]/g, '');
  if (cleaned.startsWith('+84')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('84') && cleaned.length === 11) {
    cleaned = '0' + cleaned.slice(2);
  }
  return cleaned;
}

export function isValidVNPhone(phone: string | undefined | null): boolean {
  if (!phone) return false;
  const cleaned = cleanPhoneNumber(phone);
  return /^0\d{9}$/.test(cleaned);
}

export function detectCargoCategory(text: string | undefined | null): string | null {
  if (!text) return null;
  const lower = text.toLowerCase().replace(/(?:số\s+điện\s+thoại|sđt|sdt|gọi\s+điện\s+thoại|liên\s+hệ\s+(?:qua\s+)?điện\s+thoại)/giu, " ");

  // 1. Hoa quả: unambiguous fruits + guarded terms for words that overlap with street/person names (lê, cam, đào, mận, bơ, na, vải)
  const isFruit =
    /(?:hoa\s*quả|trái\s*cây|sầu\s*riêng|cherry|xoài|bưởi|táo|dưa\s*hấu|mít|thanh\s*long|chuối|dâu\s*tây|chôm\s*chôm|măng\s*cụt|ổi|quýt|hồng\s*xiêm|dưa\s*lưới|dứa|thơm|kiwi)(?=$|[\s,.:;!?()[\]"'/])/i.test(lower) ||
    /(?:quả\s+lê|trái\s+lê|thùng\s+lê|lê\s+(?:hàn|nam\s*phi|đường|mắc\s*cọp|xanh|vàng|nâu)|\d+\s*(?:kg|kilo|cân)\s+lê(?=$|[\s,.:;!?()[\]"'/])(?!\s+(?:thánh|duẩn|lợi|văn|trọng|chân|hồng|lai|quý|đại|đức|hoàn|quốc|đình)))/i.test(lower) ||
    /(?:quả\s+cam|trái\s+cam|cam\s+(?:sành|vinh|canh|xoàn|úc|cao\s*phong)|thùng\s+cam|\d+\s*(?:kg|kilo|cân)\s+cam(?=$|[\s,.:;!?()[\]"'/])(?!\s+(?:ranh|lộ|kết)))/i.test(lower) ||
    /(?:quả\s+đào|trái\s+đào|thùng\s+đào|\d+\s*(?:kg|kilo|cân)\s+đào(?=$|[\s,.:;!?()[\]"'/])(?!\s+(?:tấn|duy|việt|xá)))/i.test(lower) ||
    /(?:quả\s+mận|trái\s+mận|thùng\s+mận|mận\s+(?:hậu|tam\s*hoa|an\s*phước)|\d+\s*(?:kg|kilo|cân)\s+mận(?=$|[\s,.:;!?()[\]"'/]))/i.test(lower) ||
    /(?:quả\s+bơ|trái\s+bơ|thùng\s+bơ|bơ\s+(?:034|sáp|bo)|\d+\s*(?:kg|kilo|cân)\s+bơ(?=$|[\s,.:;!?()[\]"'/]))/i.test(lower) ||
    /(?:quả\s+na|trái\s+na|thùng\s+na|na\s+(?:dai|bở)|\d+\s*(?:kg|kilo|cân)\s+na(?=$|[\s,.:;!?()[\]"'/]))/i.test(lower) ||
    /(?:quả\s+vải|trái\s+vải|thùng\s+vải|vải\s+(?:thiều|thanh\s*hà)|\d+\s*(?:kg|kilo|cân)\s+vải\s+thiều)/i.test(lower) ||
    /(?:nho\s+mỹ|nho\s+ninh\s*thuận|nho\s+xanh|nho\s+đỏ|chùm\s+nho)(?=$|[\s,.:;!?()[\]"'/])/i.test(lower);

  if (isFruit) {
    return 'Hoa quả';
  }

  // 2. Tài liệu
  if (/(?:tài liệu|hồ sơ|hợp đồng|chứng từ|công văn|bằng tốt nghiệp|bằng lái|học bạ|giấy tờ|hóa đơn|hộ chiếu|thư từ|sách|văn bản|bưu phẩm giấy|giấy khai sinh|sổ hộ khẩu)(?=$|[\s,.:;!?()[\]"'/])/i.test(lower)) {
    return 'Tài liệu';
  }

  // 3. Quần áo
  if (/(?:quần\s+áo|bộ\s+quần\s+áo|quần\s+jean|quần\s+bò|quần\s+âu|quần\s+đùi|áo\s+khoác|áo\s+phông|áo\s+sơ\s*mi|áo\s+thun|áo\s+len|áo\s+dạ|váy|đầm|vest|thời\s+trang|giày\s+dép|túi\s+xách|khăn\s+quàng|mũ\s+nón|tất\s+vớ|vali)(?=$|[\s,.:;!?()[\]"'/])/i.test(lower)) {
    return 'Quần áo';
  }

  // 4. Hải sản
  if (/(?:hải sản|tôm tươi|cua biển|mực tươi|cá biển|hàu|sò|ghẹ|bạch tuộc|nghêu|ốc biển|tôm khô|mực khô)(?=$|[\s,.:;!?()[\]"'/])/i.test(lower)) {
    return 'Hải sản';
  }

  // 5. Thực phẩm
  if (/(?:thực phẩm|đồ ăn|đồ khô|thịt bò|thịt lợn|thịt heo|thịt gà|bánh kẹo|mứt|giò lụa|chả lụa|nem chua|xúc xích|hạt điều|hạt dẻ|lạp xưởng|yến sào|đặc sản|đồ hộp)(?=$|[\s,.:;!?()[\]"'/])/i.test(lower)) {
    return 'Thực phẩm';
  }

  // 6. Linh kiện điện tử
  if (/(?:linh kiện điện tử|thiết bị điện tử|điện thoại|iphone|samsung|laptop|máy tính|ipad|macbook|tai nghe|sạc dự phòng|bo mạch|bàn phím|máy ảnh)(?=$|[\s,.:;!?()[\]"'/])/i.test(lower)) {
    return 'Linh kiện điện tử';
  }

  // 7. Đồ gia dụng
  if (/(?:^|[\s,.:;!?()[\]"'/])(?:đồ gia dụng|gia dụng|nồi cơm điện|chảo|bát đĩa|máy xay|máy ép|quạt điện|quạt|bàn là|ấm siêu tốc|máy sấy|lò vi sóng|nồi chiên|đèn\s*chùm|đèn\s*ngủ|đèn\s*led|đèn|bàn\s*ghế|tivi|tủ\s*lạnh|máy\s*giặt|điều\s*hòa|bếp\s*từ|bếp\s*ga|cái\s+loa|bộ\s+loa|loa\s+đài|loa\s+bluetooth|gương\s+soi|bức\s+tranh|tranh\s+ảnh|tranh\s+treo|tranh\s+sơn|tranh\s+thêu|tranh\s+đá)(?=$|[\s,.:;!?()[\]"'/])/i.test(lower)) {
    return 'Đồ gia dụng';
  }

  // 8. Mỹ phẩm
  if (/(?:mỹ phẩm|son môi|phấn|kem dưỡng|serum|dầu gội|sữa tắm|nước hoa|nước tẩy trang|toner|chăm sóc da|sữa rửa mặt|mặt nạ)(?=$|[\s,.:;!?()[\]"'/])/i.test(lower)) {
    return 'Mỹ phẩm';
  }

  // 9. Dược phẩm
  if (/(?:dược phẩm|thuốc tây|vitamin|thực phẩm chức năng|khẩu trang y tế|thiết bị y tế|dược liệu)(?=$|[\s,.:;!?()[\]"'/])/i.test(lower)) {
    return 'Dược phẩm';
  }

  return null;
}

export function removeVietnameseDiacritics(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
    .toLowerCase();
}

export const LANDMARK_REVERSE_GEOCODE: Array<{ pattern: RegExp; unaccentedPattern: RegExp; fullAddress: string; ward: string }> = [
  // Tòa nhà & Landmark & KĐT Hà Nội
  {
    pattern: /\b(?:keangnam|keang\s*nam|land?mark\s*72|lan\s*mark\s*72)\b/i,
    unaccentedPattern: /\b(?:keangnam|keang\s*nam|land?mark\s*72|lan\s*mark\s*72)\b/i,
    fullAddress: 'Tòa nhà Keangnam Landmark 72, Đường Phạm Hùng, Phường Mễ Trì, Quận Nam Từ Liêm, Hà Nội',
    ward: 'Phường Mễ Trì',
  },
  {
    pattern: /\b(?:royal\s*city|r1|r2|r3|r4|r5|r6\s*royal)\b/i,
    unaccentedPattern: /\b(?:royal\s*city)\b/i,
    fullAddress: 'Khu đô thị Royal City, 72A Nguyễn Trãi, Phường Thượng Đình, Quận Thanh Xuân, Hà Nội',
    ward: 'Phường Thượng Đình',
  },
  {
    pattern: /\b(?:times\s*city|time\s*city|t1|t2|t3|t4|t5|t6|t7|t8|t9|t10|t11\s*times|park\s*hill)\b/i,
    unaccentedPattern: /\b(?:times\s*city|time\s*city|park\s*hill)\b/i,
    fullAddress: 'Khu đô thị Times City, 458 Minh Khai, Phường Vĩnh Tuy, Quận Hai Bà Trưng, Hà Nội',
    ward: 'Phường Vĩnh Tuy',
  },
  {
    pattern: /\b(?:lotte\s*liễu\s*giai|lotte\s*center|54\s*liễu\s*giai)\b/i,
    unaccentedPattern: /\b(?:lotte\s*lieu\s*giai|lotte\s*center|54\s*lieu\s*giai)\b/i,
    fullAddress: 'Lotte Center Hanoi, 54 Liễu Giai, Phường Cống Vị, Quận Ba Đình, Hà Nội',
    ward: 'Phường Cống Vị',
  },
  {
    pattern: /\b(?:lotte\s*mall\s*tây\s*hồ|lotte\s*võ\s*chí\s*công|lotte\s*tây\s*hồ)\b/i,
    unaccentedPattern: /\b(?:lotte\s*mall\s*tay\s*ho|lotte\s*vo\s*chi\s*cong|lotte\s*tay\s*ho)\b/i,
    fullAddress: 'Lotte Mall Tây Hồ, 272 Võ Chí Công, Phường Phú Thượng, Quận Tây Hồ, Hà Nội',
    ward: 'Phường Phú Thượng',
  },
  {
    pattern: /\b(?:aeon\s*mall\s*long\s*biên|aeon\s*long\s*biên)\b/i,
    unaccentedPattern: /\b(?:aeon\s*mall\s*long\s*bien|aeon\s*long\s*bien)\b/i,
    fullAddress: 'Aeon Mall Long Biên, 27 Cổ Linh, Phường Long Biên, Quận Long Biên, Hà Nội',
    ward: 'Phường Long Biên',
  },
  {
    pattern: /\b(?:aeon\s*mall\s*hà\s*đông|aeon\s*hà\s*đông)\b/i,
    unaccentedPattern: /\b(?:aeon\s*mall\s*ha\s*dong|aeon\s*ha\s*dong)\b/i,
    fullAddress: 'Aeon Mall Hà Đông, Phường Dương Nội, Quận Hà Đông, Hà Nội',
    ward: 'Phường Dương Nội',
  },
  {
    pattern: /\b(?:vinhomes\s*ocean\s*park|ocean\s*park(?:\s*[123])?)\b/i,
    unaccentedPattern: /\b(?:vinhomes\s*ocean\s*park|ocean\s*park)\b/i,
    fullAddress: 'Khu đô thị Vinhomes Ocean Park, Xã Đa Tốn, Huyện Gia Lâm, Hà Nội',
    ward: 'Xã Đa Tốn',
  },
  {
    pattern: /\b(?:vinhomes\s*smart\s*city|smart\s*city)\b/i,
    unaccentedPattern: /\b(?:vinhomes\s*smart\s*city|smart\s*city)\b/i,
    fullAddress: 'Khu đô thị Vinhomes Smart City, Phường Tây Mỗ, Quận Nam Từ Liêm, Hà Nội',
    ward: 'Phường Tây Mỗ',
  },
  {
    pattern: /\b(?:ecopark)\b/i,
    unaccentedPattern: /\b(?:ecopark)\b/i,
    fullAddress: 'Khu đô thị Ecopark, Xã Xuân Quan, Huyện Văn Giang, Hưng Yên',
    ward: 'Xã Xuân Quan',
  },
  {
    pattern: /\b(?:ngoại\s*giao\s*đoàn|kđt\s*ngoại\s*giao\s*đoàn)\b/i,
    unaccentedPattern: /\b(?:ngoai\s*giao\s*doan|kdt\s*ngoai\s*giao\s*doan)\b/i,
    fullAddress: 'Khu đô thị Ngoại Giao Đoàn, Phường Xuân Tảo, Quận Bắc Từ Liêm, Hà Nội',
    ward: 'Phường Xuân Tảo',
  },
  {
    pattern: /\b(?:ciputra|kđt\s*ciputra)\b/i,
    unaccentedPattern: /\b(?:ciputra|kdt\s*ciputra)\b/i,
    fullAddress: 'Khu đô thị Ciputra Nam Thăng Long, Phường Xuân Đỉnh, Quận Bắc Từ Liêm, Hà Nội',
    ward: 'Phường Xuân Đỉnh',
  },
  {
    pattern: /\b(?:linh\s*đàm|bán\s*đảo\s*linh\s*đàm|kđt\s*linh\s*đàm|hh\s*linh\s*đàm)\b/i,
    unaccentedPattern: /\b(?:linh\s*dam|ban\s*dao\s*linh\s*dam|kdt\s*linh\s*dam|hh\s*linh\s*dam)\b/i,
    fullAddress: 'Khu đô thị Bán đảo Linh Đàm, Phường Hoàng Liệt, Quận Hoàng Mai, Hà Nội',
    ward: 'Phường Hoàng Liệt',
  },
  {
    pattern: /\b(?:big\s*c\s*thăng\s*long|go\s*thăng\s*long)\b/i,
    unaccentedPattern: /\b(?:big\s*c\s*thang\s*long|go\s*thang\s*long)\b/i,
    fullAddress: 'Siêu thị Big C Thăng Long, 222 Trần Duy Hưng, Phường Trung Hòa, Quận Cầu Giấy, Hà Nội',
    ward: 'Phường Trung Hòa',
  },
  {
    pattern: /\b(?:vincom\s*bà\s*triệu)\b/i,
    unaccentedPattern: /\b(?:vincom\s*ba\s*trieu)\b/i,
    fullAddress: 'Vincom Center Bà Triệu, 191 Bà Triệu, Phường Lê Đại Hành, Quận Hai Bà Trưng, Hà Nội',
    ward: 'Phường Lê Đại Hành',
  },
  {
    pattern: /\b(?:vincom\s*nguyễn\s*chí\s*thanh)\b/i,
    unaccentedPattern: /\b(?:vincom\s*nguyen\s*chi\s*thanh)\b/i,
    fullAddress: 'Vincom Center Nguyễn Chí Thanh, 54A Nguyễn Chí Thanh, Phường Láng Thượng, Quận Đống Đa, Hà Nội',
    ward: 'Phường Láng Thượng',
  },
  {
    pattern: /\b(?:vincom\s*trần\s*duy\s*hưng)\b/i,
    unaccentedPattern: /\b(?:vincom\s*tran\s*duy\s*hung)\b/i,
    fullAddress: 'Vincom Center Trần Duy Hưng, Phường Trung Hòa, Quận Cầu Giấy, Hà Nội',
    ward: 'Phường Trung Hòa',
  },
  {
    pattern: /\b(?:hồ\s*gươm\s*plaza|ho\s*guom\s*plaza)\b/i,
    unaccentedPattern: /\b(?:ho\s*guom\s*plaza)\b/i,
    fullAddress: 'Hồ Gươm Plaza, 102 Trần Phú, Phường Mộ Lao, Quận Hà Đông, Hà Nội',
    ward: 'Phường Mộ Lao',
  },

  // Bến xe & Sân bay Hà Nội
  {
    pattern: /\b(?:bến\s*xe\s*mỹ\s*đình|bx\s*mỹ\s*đình)\b/i,
    unaccentedPattern: /\b(?:ben\s*xe\s*my\s*dinh|bx\s*my\s*dinh)\b/i,
    fullAddress: 'Bến xe Mỹ Đình, 20 Phạm Hùng, Phường Mỹ Đình 2, Quận Nam Từ Liêm, Hà Nội',
    ward: 'Phường Mỹ Đình 2',
  },
  {
    pattern: /\b(?:bến\s*xe\s*giáp\s*bát|bx\s*giáp\s*bát)\b/i,
    unaccentedPattern: /\b(?:ben\s*xe\s*giap\s*bat|bx\s*giap\s*bat)\b/i,
    fullAddress: 'Bến xe Giáp Bát, Km6 Giải Phóng, Phường Giáp Bát, Quận Hoàng Mai, Hà Nội',
    ward: 'Phường Giáp Bát',
  },
  {
    pattern: /\b(?:bến\s*xe\s*nước\s*ngầm|bx\s*nước\s*ngầm)\b/i,
    unaccentedPattern: /\b(?:ben\s*xe\s*nuoc\s*ngam|bx\s*nuoc\s*ngam)\b/i,
    fullAddress: 'Bến xe Nước Ngầm, Số 1 Ngọc Hồi, Phường Hoàng Liệt, Quận Hoàng Mai, Hà Nội',
    ward: 'Phường Hoàng Liệt',
  },
  {
    pattern: /\b(?:bến\s*xe\s*yên\s*nghĩa|bx\s*yên\s*nghĩa)\b/i,
    unaccentedPattern: /\b(?:ben\s*xe\s*yen\s*nghia|bx\s*yen\s*nghia)\b/i,
    fullAddress: 'Bến xe Yên Nghĩa, Quốc lộ 6, Phường Yên Nghĩa, Quận Hà Đông, Hà Nội',
    ward: 'Phường Yên Nghĩa',
  },
  {
    pattern: /\b(?:bến\s*xe\s*gia\s*lâm|bx\s*gia\s*lâm)\b/i,
    unaccentedPattern: /\b(?:ben\s*xe\s*gia\s*lam|bx\s*gia\s*lam)\b/i,
    fullAddress: 'Bến xe Gia Lâm, Số 9 Ngô Gia Khảm, Phường Gia Thụy, Quận Long Biên, Hà Nội',
    ward: 'Phường Gia Thụy',
  },
  {
    pattern: /\b(?:sân\s*bay\s*nội\s*bài|nội\s*bài)\b/i,
    unaccentedPattern: /\b(?:san\s*bay\s*noi\s*bai|noi\s*bai)\b/i,
    fullAddress: 'Sân bay Quốc tế Nội Bài, Xã Phú Minh, Huyện Sóc Sơn, Hà Nội',
    ward: 'Xã Phú Minh',
  },

  // Bệnh viện & Trường ĐH Hà Nội
  {
    pattern: /\b(?:bệnh\s*viện\s*bạch\s*mai|bv\s*bạch\s*mai|bạch\s*mai)\b/i,
    unaccentedPattern: /\b(?:benh\s*vien\s*bach\s*mai|bv\s*bach\s*mai|bach\s*mai)\b/i,
    fullAddress: 'Bệnh viện Bạch Mai, 78 Giải Phóng, Phường Phương Mai, Quận Đống Đa, Hà Nội',
    ward: 'Phường Phương Mai',
  },
  {
    pattern: /\b(?:bệnh\s*viện\s*việt\s*đức|bv\s*việt\s*đức)\b/i,
    unaccentedPattern: /\b(?:benh\s*vien\s*viet\s*duc|bv\s*viet\s*duc)\b/i,
    fullAddress: 'Bệnh viện Hữu nghị Việt Đức, 40 Tràng Thi, Phường Hàng Bông, Quận Hoàn Kiếm, Hà Nội',
    ward: 'Phường Hàng Bông',
  },
  {
    pattern: /\b(?:bệnh\s*viện\s*108|bv\s*108|viện\s*108)\b/i,
    unaccentedPattern: /\b(?:benh\s*vien\s*108|bv\s*108|vien\s*108)\b/i,
    fullAddress: 'Bệnh viện Trung ương Quân đội 108, Số 1 Trần Hưng Đạo, Phường Bạch Đằng, Quận Hai Bà Trưng, Hà Nội',
    ward: 'Phường Bạch Đằng',
  },
  {
    pattern: /\b(?:bệnh\s*viện\s*nhi\s*trung\s*ương|bv\s*nhi\s*tư|bv\s*nhi\s*tw)\b/i,
    unaccentedPattern: /\b(?:benh\s*vien\s*nhi\s*trung\s*uong|bv\s*nhi\s*tu|bv\s*nhi\s*tw)\b/i,
    fullAddress: 'Bệnh viện Nhi Trung ương, 18/879 La Thành, Phường Láng Thượng, Quận Đống Đa, Hà Nội',
    ward: 'Phường Láng Thượng',
  },
  {
    pattern: /\b(?:bệnh\s*viện\s*phụ\s*sản\s*hà\s*nội|bv\s*phụ\s*sản\s*hn)\b/i,
    unaccentedPattern: /\b(?:benh\s*vien\s*phu\s*san\s*ha\s*noi|bv\s*phu\s*san\s*hn)\b/i,
    fullAddress: 'Bệnh viện Phụ sản Hà Nội, 929 Đê La Thành, Phường Ngọc Khánh, Quận Ba Đình, Hà Nội',
    ward: 'Phường Ngọc Khánh',
  },
  {
    pattern: /\b(?:bệnh\s*viện\s*đại\s*học\s*y\s*hà\s*nội|bv\s*đại\s*học\s*y|bv\s*đh\s*y)\b/i,
    unaccentedPattern: /\b(?:benh\s*vien\s*dai\s*hoc\s*y|bv\s*dh\s*y)\b/i,
    fullAddress: 'Bệnh viện Đại học Y Hà Nội, 1 Tôn Thất Tùng, Phường Trung Tự, Quận Đống Đa, Hà Nội',
    ward: 'Phường Trung Tự',
  },
  {
    pattern: /\b(?:đại\s*học\s*bách\s*khoa\s*hà\s*nội|đh\s*bách\s*khoa|đhbk\s*hà\s*nội)\b/i,
    unaccentedPattern: /\b(?:dai\s*hoc\s*bach\s*khoa\s*ha\s*noi|dh\s*bach\s*khoa|dhbk)\b/i,
    fullAddress: 'Trường Đại học Bách Khoa Hà Nội, Số 1 Đại Cồ Việt, Phường Bách Khoa, Quận Hai Bà Trưng, Hà Nội',
    ward: 'Phường Bách Khoa',
  },
  {
    pattern: /\b(?:đại\s*học\s*kinh\s*tế\s*quốc\s*dân|neu)\b/i,
    unaccentedPattern: /\b(?:dai\s*hoc\s*kinh\s*te\s*quoc\s*dan|neu)\b/i,
    fullAddress: 'Trường Đại học Kinh tế Quốc dân, 207 Giải Phóng, Phường Đồng Tâm, Quận Hai Bà Trưng, Hà Nội',
    ward: 'Phường Đồng Tâm',
  },
  {
    pattern: /\b(?:đại\s*học\s*quốc\s*gia\s*hà\s*nội|đhqghn)\b/i,
    unaccentedPattern: /\b(?:dai\s*hoc\s*quoc\s*gia\s*ha\s*noi|dhqghn)\b/i,
    fullAddress: 'Đại học Quốc gia Hà Nội, 144 Xuân Thủy, Phường Dịch Vọng Hậu, Quận Cầu Giấy, Hà Nội',
    ward: 'Phường Dịch Vọng Hậu',
  },
  {
    pattern: /\b(?:đại\s*học\s*ngoại\s*thương|ftu)\b/i,
    unaccentedPattern: /\b(?:dai\s*hoc\s*ngoai\s*thuong|ftu)\b/i,
    fullAddress: 'Trường Đại học Ngoại Thương, 91 Chùa Láng, Phường Láng Thượng, Quận Đống Đa, Hà Nội',
    ward: 'Phường Láng Thượng',
  },
  {
    pattern: /\b(?:đại\s*học\s*sư\s*phạm\s*hà\s*nội|đh\s*sư\s*phạm\s*hn)\b/i,
    unaccentedPattern: /\b(?:dai\s*hoc\s*su\s*pham\s*ha\s*noi|dh\s*su\s*pham)\b/i,
    fullAddress: 'Trường Đại học Sư phạm Hà Nội, 136 Xuân Thủy, Phường Dịch Vọng Hậu, Quận Cầu Giấy, Hà Nội',
    ward: 'Phường Dịch Vọng Hậu',
  },
  {
    pattern: /\b(?:hồ\s*gươm|bờ\s*hồ|hồ\s*hoàn\s*kiếm|tràng\s*tiền\s*plaza)\b/i,
    unaccentedPattern: /\b(?:ho\s*guom|bo\s*ho|ho\s*hoan\s*kiem|trang\s*tien\s*plaza)\b/i,
    fullAddress: 'Khu vực Hồ Hoàn Kiếm, Phường Tràng Tiền, Quận Hoàn Kiếm, Hà Nội',
    ward: 'Phường Tràng Tiền',
  },
  {
    pattern: /\b(?:chợ\s*đồng\s*xuân)\b/i,
    unaccentedPattern: /\b(?:cho\s*dong\s*xuan)\b/i,
    fullAddress: 'Chợ Đồng Xuân, Phường Đồng Xuân, Quận Hoàn Kiếm, Hà Nội',
    ward: 'Phường Đồng Xuân',
  },

  // Đường phố cụ thể tại Hà Nội
  {
    pattern: /\b(?:(?:phố|đường)?\s*lê\s*thánh\s*tông(?:[,\s]+(?:hn|hà\s*nội|hoàn\s*kiếm))?)\b/i,
    unaccentedPattern: /\b(?:(?:pho|duong)?\s*le\s*thanh\s*tong(?:[,\s]+(?:hn|ha\s*noi|hoan\s*kiem))?)\b/i,
    fullAddress: 'Đường Lê Thánh Tông, Phường Phan Chu Trinh, Quận Hoàn Kiếm, Hà Nội',
    ward: 'Phường Phan Chu Trinh',
  },
  {
    pattern: /\b(?:(?:phố|đường)?\s*(?:tràng\s*tiền|đinh\s*tiên\s*hoàng|hàng\s*khay)(?:[,\s]+(?:hn|hà\s*nội|hoàn\s*kiếm))?)\b/i,
    unaccentedPattern: /\b(?:(?:pho|duong)?\s*(?:trang\s*tien|dinh\s*tien\s*hoang|hang\s*khay)(?:[,\s]+(?:hn|ha\s*noi|hoan\s*kiem))?)\b/i,
    fullAddress: 'Phố Tràng Tiền, Phường Tràng Tiền, Quận Hoàn Kiếm, Hà Nội',
    ward: 'Phường Tràng Tiền',
  },
  {
    pattern: /\b(?:(?:phố|đường)?\s*lý\s*thường\s*kiệt(?:[,\s]+(?:hn|hà\s*nội|hoàn\s*kiếm))?)\b/i,
    unaccentedPattern: /\b(?:(?:pho|duong)?\s*ly\s*thuong\s*kiet(?:[,\s]+(?:hn|ha\s*noi|hoan\s*kiem))?)\b/i,
    fullAddress: 'Phố Lý Thường Kiệt, Phường Hàng Bài, Quận Hoàn Kiếm, Hà Nội',
    ward: 'Phường Hàng Bài',
  },
  {
    pattern: /\b(?:(?:phố|đường)?\s*trần\s*hưng\s*đạo(?:[,\s]+(?:hn|hà\s*nội|hoàn\s*kiếm)))\b/i,
    unaccentedPattern: /\b(?:(?:pho|duong)?\s*tran\s*hung\s*dao(?:[,\s]+(?:hn|ha\s*noi|hoan\s*kiem)))\b/i,
    fullAddress: 'Phố Trần Hưng Đạo, Phường Phan Chu Trinh, Quận Hoàn Kiếm, Hà Nội',
    ward: 'Phường Phan Chu Trinh',
  },
  {
    pattern: /\b(?:(?:phố|đường)?\s*hai\s*bà\s*trưng(?:[,\s]+(?:hn|hà\s*nội|hoàn\s*kiếm)))\b/i,
    unaccentedPattern: /\b(?:(?:pho|duong)?\s*hai\s*ba\s*trung(?:[,\s]+(?:hn|ha\s*noi|hoan\s*kiem)))\b/i,
    fullAddress: 'Phố Hai Bà Trưng, Phường Tràng Tiền, Quận Hoàn Kiếm, Hà Nội',
    ward: 'Phường Tràng Tiền',
  },
  {
    pattern: /\b(?:(?:phố|đường)?\s*bà\s*triệu(?:[,\s]+(?:hn|hà\s*nội|hai\s*bà\s*trưng|hbt))?)\b/i,
    unaccentedPattern: /\b(?:(?:pho|duong)?\s*ba\s*trieu(?:[,\s]+(?:hn|ha\s*noi|hai\s*ba\s*trung|hbt))?)\b/i,
    fullAddress: 'Phố Bà Triệu, Phường Lê Đại Hành, Quận Hai Bà Trưng, Hà Nội',
    ward: 'Phường Lê Đại Hành',
  },
  {
    pattern: /\b(?:phố\s*huế(?:[,\s]+(?:hn|hà\s*nội|hai\s*bà\s*trưng))?)\b/i,
    unaccentedPattern: /\b(?:pho\s*hue(?:[,\s]+(?:hn|ha\s*noi|hai\s*ba\s*trung))?)\b/i,
    fullAddress: 'Phố Huế, Phường Phố Huế, Quận Hai Bà Trưng, Hà Nội',
    ward: 'Phường Phố Huế',
  },
  {
    pattern: /\b(?:(?:phố|đường)?\s*đại\s*cồ\s*việt(?:[,\s]+(?:hn|hà\s*nội))?)\b/i,
    unaccentedPattern: /\b(?:(?:pho|duong)?\s*dai\s*co\s*viet(?:[,\s]+(?:hn|ha\s*noi))?)\b/i,
    fullAddress: 'Đường Đại Cồ Việt, Phường Bách Khoa, Quận Hai Bà Trưng, Hà Nội',
    ward: 'Phường Bách Khoa',
  },
  {
    pattern: /\b(?:120\s*cầu\s*giấy)\b/i,
    unaccentedPattern: /\b(?:120\s*cau\s*giay)\b/i,
    fullAddress: '120 Cầu Giấy, Phường Quan Hoa, Quận Cầu Giấy, Hà Nội',
    ward: 'Phường Quan Hoa',
  },
  {
    pattern: /\b(?:88\s*trần\s*duy\s*hưng)\b/i,
    unaccentedPattern: /\b(?:88\s*tran\s*duy\s*hung)\b/i,
    fullAddress: '88 Trần Duy Hưng, Phường Trung Hòa, Quận Cầu Giấy, Hà Nội',
    ward: 'Phường Trung Hòa',
  },
  {
    pattern: /\b(?:duy\s*tân)\b/i,
    unaccentedPattern: /\b(?:duy\s*tan)\b/i,
    fullAddress: 'Đường Duy Tân, Phường Dịch Vọng Hậu, Quận Cầu Giấy, Hà Nội',
    ward: 'Phường Dịch Vọng Hậu',
  },
  {
    pattern: /\b(?:xuân\s*thủy(?:[,\s]+(?:hn|hà\s*nội|cầu\s*giấy))?)\b/i,
    unaccentedPattern: /\b(?:xuan\s*thuy(?:[,\s]+(?:hn|ha\s*noi|cau\s*giay))?)\b/i,
    fullAddress: 'Đường Xuân Thủy, Phường Dịch Vọng Hậu, Quận Cầu Giấy, Hà Nội',
    ward: 'Phường Dịch Vọng Hậu',
  },
  {
    pattern: /\b(?:hoàng\s*quốc\s*việt(?:[,\s]+(?:hn|hà\s*nội|cầu\s*giấy))?)\b/i,
    unaccentedPattern: /\b(?:hoang\s*quoc\s*viet(?:[,\s]+(?:hn|ha\s*noi|cau\s*giay))?)\b/i,
    fullAddress: 'Đường Hoàng Quốc Việt, Phường Nghĩa Đô, Quận Cầu Giấy, Hà Nội',
    ward: 'Phường Nghĩa Đô',
  },
  {
    pattern: /\b(?:trung\s*kính(?:[,\s]+(?:hn|hà\s*nội|cầu\s*giấy))?)\b/i,
    unaccentedPattern: /\b(?:trung\s*kinh(?:[,\s]+(?:hn|ha\s*noi|cau\s*giay))?)\b/i,
    fullAddress: 'Đường Trung Kính, Phường Trung Hòa, Quận Cầu Giấy, Hà Nội',
    ward: 'Phường Trung Hòa',
  },
  {
    pattern: /\b(?:chùa\s*láng)\b/i,
    unaccentedPattern: /\b(?:chua\s*lang)\b/i,
    fullAddress: 'Phố Chùa Láng, Phường Láng Thượng, Quận Đống Đa, Hà Nội',
    ward: 'Phường Láng Thượng',
  },
  {
    pattern: /\b(?:thái\s*hà)\b/i,
    unaccentedPattern: /\b(?:thai\s*ha)\b/i,
    fullAddress: 'Phố Thái Hà, Phường Trung Liệt, Quận Đống Đa, Hà Nội',
    ward: 'Phường Trung Liệt',
  },
  {
    pattern: /\b(?:chùa\s*bộc)\b/i,
    unaccentedPattern: /\b(?:chua\s*boc)\b/i,
    fullAddress: 'Phố Chùa Bộc, Phường Quang Trung, Quận Đống Đa, Hà Nội',
    ward: 'Phường Quang Trung',
  },
  {
    pattern: /\b(?:xã\s*đàn)\b/i,
    unaccentedPattern: /\b(?:xa\s*dan)\b/i,
    fullAddress: 'Đường Xã Đàn, Phường Nam Đồng, Quận Đống Đa, Hà Nội',
    ward: 'Phường Nam Đồng',
  },
  {
    pattern: /\b(?:láng\s*hạ(?:[,\s]+(?:hn|hà\s*nội|đống\s*đa))?)\b/i,
    unaccentedPattern: /\b(?:lang\s*ha(?:[,\s]+(?:hn|ha\s*noi|dong\s*da))?)\b/i,
    fullAddress: 'Phố Láng Hạ, Phường Láng Hạ, Quận Đống Đa, Hà Nội',
    ward: 'Phường Láng Hạ',
  },
  {
    pattern: /\b(?:nguyễn\s*chí\s*thanh(?:[,\s]+(?:hn|hà\s*nội|đống\s*đa)))\b/i,
    unaccentedPattern: /\b(?:nguyen\s*chi\s*thanh(?:[,\s]+(?:hn|ha\s*noi|dong\s*da)))\b/i,
    fullAddress: 'Đường Nguyễn Chí Thanh, Phường Láng Thượng, Quận Đống Đa, Hà Nội',
    ward: 'Phường Láng Thượng',
  },
  {
    pattern: /\b(?:giảng\s*võ(?:[,\s]+(?:hn|hà\s*nội|ba\s*đình))?)\b/i,
    unaccentedPattern: /\b(?:giang\s*vo(?:[,\s]+(?:hn|ha\s*noi|ba\s*dinh))?)\b/i,
    fullAddress: 'Phố Giảng Võ, Phường Giảng Võ, Quận Ba Đình, Hà Nội',
    ward: 'Phường Giảng Võ',
  },
  {
    pattern: /\b(?:kim\s*mã)\b/i,
    unaccentedPattern: /\b(?:kim\s*ma)\b/i,
    fullAddress: 'Phố Kim Mã, Phường Kim Mã, Quận Ba Đình, Hà Nội',
    ward: 'Phường Kim Mã',
  },
  {
    pattern: /\b(?:liễu\s*giai|đội\s*cấn)(?:[,\s]+(?:hn|hà\s*nội|ba\s*đình))?\b/i,
    unaccentedPattern: /\b(?:lieu\s*giai|doi\s*can)(?:[,\s]+(?:hn|ha\s*noi|ba\s*dinh))?\b/i,
    fullAddress: 'Phố Liễu Giai, Phường Cống Vị, Quận Ba Đình, Hà Nội',
    ward: 'Phường Cống Vị',
  },
  {
    pattern: /\b(?:nguyễn\s*trãi(?:[,\s]+(?:hn|hà\s*nội|thanh\s*xuân)))\b/i,
    unaccentedPattern: /\b(?:nguyen\s*trai(?:[,\s]+(?:hn|ha\s*noi|thanh\s*xuan)))\b/i,
    fullAddress: 'Đường Nguyễn Trãi, Phường Thượng Đình, Quận Thanh Xuân, Hà Nội',
    ward: 'Phường Thượng Đình',
  },
  {
    pattern: /\b(?:lê\s*văn\s*lương(?:[,\s]+(?:hn|hà\s*nội|thanh\s*xuân)))\b/i,
    unaccentedPattern: /\b(?:le\s*van\s*luong(?:[,\s]+(?:hn|ha\s*noi|thanh\s*xuan)))\b/i,
    fullAddress: 'Đường Lê Văn Lương, Phường Nhân Chính, Quận Thanh Xuân, Hà Nội',
    ward: 'Phường Nhân Chính',
  },
  {
    pattern: /\b(?:khuất\s*duy\s*tiến(?:[,\s]+(?:hn|hà\s*nội|thanh\s*xuân))?)\b/i,
    unaccentedPattern: /\b(?:khuat\s*duy\s*tien(?:[,\s]+(?:hn|ha\s*noi|thanh\s*xuan))?)\b/i,
    fullAddress: 'Đường Khuất Duy Tiến, Phường Thanh Xuân Bắc, Quận Thanh Xuân, Hà Nội',
    ward: 'Phường Thanh Xuân Bắc',
  },
  {
    pattern: /\b(?:võ\s*chí\s*công|lạc\s*long\s*quân)(?:[,\s]+(?:hn|hà\s*nội|tây\s*hồ))?\b/i,
    unaccentedPattern: /\b(?:vo\s*chi\s*cong|lac\s*long\s*quan)(?:[,\s]+(?:hn|ha\s*noi|tay\s*ho))?\b/i,
    fullAddress: 'Đường Võ Chí Công, Phường Xuân La, Quận Tây Hồ, Hà Nội',
    ward: 'Phường Xuân La',
  },
  {
    pattern: /\b(?:nguyễn\s*văn\s*cừ(?:[,\s]+(?:hn|hà\s*nội|long\s*biên)))\b/i,
    unaccentedPattern: /\b(?:nguyen\s*van\s*cu(?:[,\s]+(?:hn|ha\s*noi|long\s*bien)))\b/i,
    fullAddress: 'Đường Nguyễn Văn Cừ, Phường Bồ Đề, Quận Long Biên, Hà Nội',
    ward: 'Phường Bồ Đề',
  },
  {
    pattern: /\b(?:quang\s*trung(?:[,\s]+(?:hn|hà\s*nội|hà\s*đông)))\b/i,
    unaccentedPattern: /\b(?:quang\s*trung(?:[,\s]+(?:hn|ha\s*noi|ha\s*dong)))\b/i,
    fullAddress: 'Đường Quang Trung, Phường Quang Trung, Quận Hà Đông, Hà Nội',
    ward: 'Phường Quang Trung',
  },

  // TP. Hồ Chí Minh
  {
    pattern: /\b(?:land?mark\s*81|lan\s*mark\s*81|vinhomes\s*central\s*park)\b/i,
    unaccentedPattern: /\b(?:land?mark\s*81|lan\s*mark\s*81|vinhomes\s*central\s*park)\b/i,
    fullAddress: 'Tòa nhà Landmark 81, Vinhomes Central Park, Phường 22, Quận Bình Thạnh, TP. Hồ Chí Minh',
    ward: 'Phường 22',
  },
  {
    pattern: /\b(?:bitexco|tòa\s*nhà\s*bitexco)\b/i,
    unaccentedPattern: /\b(?:bitexco|toa\s*nha\s*bitexco)\b/i,
    fullAddress: 'Tòa nhà Bitexco Financial Tower, 2 Hải Triều, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    ward: 'Phường Bến Nghé',
  },
  {
    pattern: /\b(?:chợ\s*bến\s*thành|bến\s*thành(?:\s*q1|\s*quận\s*1)?)\b/i,
    unaccentedPattern: /\b(?:cho\s*ben\s*thanh|ben\s*thanh(?:\s*q1|\s*quan\s*1)?)\b/i,
    fullAddress: 'Chợ Bến Thành, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh',
    ward: 'Phường Bến Thành',
  },
  {
    pattern: /\b(?:phố\s*đi\s*bộ\s*nguyễn\s*huệ|nguyễn\s*huệ\s*q1|nguyễn\s*huệ\s*quận\s*1)\b/i,
    unaccentedPattern: /\b(?:pho\s*di\s*bo\s*nguyen\s*hue|nguyen\s*hue\s*q1|nguyen\s*hue\s*quan\s*1)\b/i,
    fullAddress: 'Đường Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    ward: 'Phường Bến Nghé',
  },
  {
    pattern: /\b(?:bùi\s*viện|phố\s*tây\s*bùi\s*viện)\b/i,
    unaccentedPattern: /\b(?:bui\s*vien|pho\s*tay\s*bui\s*vien)\b/i,
    fullAddress: 'Đường Bùi Viện, Phường Phạm Ngũ Lão, Quận 1, TP. Hồ Chí Minh',
    ward: 'Phường Phạm Ngũ Lão',
  },
  {
    pattern: /\b(?:sân\s*bay\s*tân\s*sơn\s*nhất|tân\s*sơn\s*nhất)\b/i,
    unaccentedPattern: /\b(?:san\s*bay\s*tan\s*son\s*nhat|tan\s*son\s*nhat)\b/i,
    fullAddress: 'Sân bay Quốc tế Tân Sơn Nhất, Phường 2, Quận Tân Bình, TP. Hồ Chí Minh',
    ward: 'Phường 2',
  },
  {
    pattern: /\b(?:bến\s*xe\s*miền\s*đông|bx\s*miền\s*đông)\b/i,
    unaccentedPattern: /\b(?:ben\s*xe\s*mien\s*dong|bx\s*mien\s*dong)\b/i,
    fullAddress: 'Bến xe Miền Đông, 292 Đinh Bộ Lĩnh, Phường 26, Quận Bình Thạnh, TP. Hồ Chí Minh',
    ward: 'Phường 26',
  },
  {
    pattern: /\b(?:bến\s*xe\s*miền\s*tây|bx\s*miền\s*tây)\b/i,
    unaccentedPattern: /\b(?:ben\s*xe\s*mien\s*tay|bx\s*mien\s*tay)\b/i,
    fullAddress: 'Bến xe Miền Tây, 395 Kinh Dương Vương, Phường An Lạc, Quận Bình Tân, TP. Hồ Chí Minh',
    ward: 'Phường An Lạc',
  },
  {
    pattern: /\b(?:bến\s*xe\s*an\s*sương|bx\s*an\s*sương)\b/i,
    unaccentedPattern: /\b(?:ben\s*xe\s*an\s*suong|bx\s*an\s*suong)\b/i,
    fullAddress: 'Bến xe An Sương, Quốc lộ 22, Phường Trung Mỹ Tây, Quận 12, TP. Hồ Chí Minh',
    ward: 'Phường Trung Mỹ Tây',
  },
  {
    pattern: /\b(?:bệnh\s*viện\s*chợ\s*rẫy|bv\s*chợ\s*rẫy)\b/i,
    unaccentedPattern: /\b(?:benh\s*vien\s*cho\s*ray|bv\s*cho\s*ray)\b/i,
    fullAddress: 'Bệnh viện Chợ Rẫy, 201B Nguyễn Chí Thanh, Phường 12, Quận 5, TP. Hồ Chí Minh',
    ward: 'Phường 12',
  },
  {
    pattern: /\b(?:bệnh\s*viện\s*từ\s*dũ|bv\s*từ\s*dũ)\b/i,
    unaccentedPattern: /\b(?:benh\s*vien\s*tu\s*du|bv\s*tu\s*du)\b/i,
    fullAddress: 'Bệnh viện Từ Dũ, 284 Cống Quỳnh, Phường Phạm Ngũ Lão, Quận 1, TP. Hồ Chí Minh',
    ward: 'Phường Phạm Ngũ Lão',
  },
  {
    pattern: /\b(?:vinhomes\s*grand\s*park)\b/i,
    unaccentedPattern: /\b(?:vinhomes\s*grand\s*park)\b/i,
    fullAddress: 'Khu đô thị Vinhomes Grand Park, Phường Long Bình, TP. Thủ Đức, TP. Hồ Chí Minh',
    ward: 'Phường Long Bình',
  },
  {
    pattern: /\b(?:kđt\s*sala|khu\s*đô\s*thị\s*sala)\b/i,
    unaccentedPattern: /\b(?:kdt\s*sala|khu\s*do\s*thi\s*sala)\b/i,
    fullAddress: 'Khu đô thị Sala, 10 Mai Chí Thọ, Phường An Lợi Đông, TP. Thủ Đức, TP. Hồ Chí Minh',
    ward: 'Phường An Lợi Đông',
  },
  {
    pattern: /\b(?:phú\s*mỹ\s*hưng|kđt\s*phú\s*mỹ\s*hưng)\b/i,
    unaccentedPattern: /\b(?:phu\s*my\s*hung|kdt\s*phu\s*my\s*hung)\b/i,
    fullAddress: 'Khu đô thị Phú Mỹ Hưng, Phường Tân Phong, Quận 7, TP. Hồ Chí Minh',
    ward: 'Phường Tân Phong',
  },
  {
    pattern: /\b(?:chợ\s*tân\s*bình)\b/i,
    unaccentedPattern: /\b(?:cho\s*tan\s*binh)\b/i,
    fullAddress: 'Chợ Tân Bình, Đường Lý Thường Kiệt, Phường 8, Quận Tân Bình, TP. Hồ Chí Minh',
    ward: 'Phường 8',
  },
  {
    pattern: /\b(?:chợ\s*an\s*đông)\b/i,
    unaccentedPattern: /\b(?:cho\s*an\s*dong)\b/i,
    fullAddress: 'Chợ An Đông, Công trường An Đông, Phường 9, Quận 5, TP. Hồ Chí Minh',
    ward: 'Phường 9',
  },
  {
    pattern: /\b(?:chợ\s*kim\s*biên)\b/i,
    unaccentedPattern: /\b(?:cho\s*kim\s*bien)\b/i,
    fullAddress: 'Chợ Kim Biên, Phường 13, Quận 5, TP. Hồ Chí Minh',
    ward: 'Phường 13',
  },
  {
    pattern: /\b(?:chợ\s*bà\s*chiểu)\b/i,
    unaccentedPattern: /\b(?:cho\s*ba\s*chieu)\b/i,
    fullAddress: 'Chợ Bà Chiểu, Đường Bạch Đằng, Phường 1, Quận Bình Thạnh, TP. Hồ Chí Minh',
    ward: 'Phường 1',
  },
  {
    pattern: /\b(?:vạn\s*hạnh\s*mall)\b/i,
    unaccentedPattern: /\b(?:van\s*hanh\s*mall)\b/i,
    fullAddress: 'Vạn Hạnh Mall, 11 Sư Vạn Hạnh, Phường 12, Quận 10, TP. Hồ Chí Minh',
    ward: 'Phường 12',
  },
  {
    pattern: /\b(?:giga\s*mall)\b/i,
    unaccentedPattern: /\b(?:giga\s*mall)\b/i,
    fullAddress: 'Giga Mall Phạm Văn Đồng, Phường Hiệp Bình Chánh, TP. Thủ Đức, TP. Hồ Chí Minh',
    ward: 'Phường Hiệp Bình Chánh',
  },
  {
    pattern: /\b(?:aeon\s*mall\s*tân\s*phú|aeon\s*tân\s*phú)\b/i,
    unaccentedPattern: /\b(?:aeon\s*mall\s*tan\s*phu|aeon\s*tan\s*phu)\b/i,
    fullAddress: 'Aeon Mall Tân Phú Celadon, 30 Tân Thắng, Phường Sơn Kỳ, Quận Tân Phú, TP. Hồ Chí Minh',
    ward: 'Phường Sơn Kỳ',
  },
  {
    pattern: /\b(?:aeon\s*mall\s*bình\s*tân|aeon\s*bình\s*tân)\b/i,
    unaccentedPattern: /\b(?:aeon\s*mall\s*binh\s*tan|aeon\s*binh\s*tan)\b/i,
    fullAddress: 'Aeon Mall Bình Tân, Phường Bình Trị Đông B, Quận Bình Tân, TP. Hồ Chí Minh',
    ward: 'Phường Bình Trị Đông B',
  },
  {
    pattern: /\b(?:vincom\s*đồng\s*khởi)\b/i,
    unaccentedPattern: /\b(?:vincom\s*dong\s*khoi)\b/i,
    fullAddress: 'Vincom Center Đồng Khởi, 72 Lê Thánh Tôn, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    ward: 'Phường Bến Nghé',
  },

  // Đà Nẵng
  {
    pattern: /\b(?:45\s*lê\s*duẩn(?:\s*đà\s*nẵng)?)\b/i,
    unaccentedPattern: /\b(?:45\s*le\s*duan(?:\s*da\s*nang)?)\b/i,
    fullAddress: '45 Lê Duẩn, Phường Hải Châu 1, Quận Hải Châu, Đà Nẵng',
    ward: 'Phường Hải Châu 1',
  },
  {
    pattern: /\b(?:lê\s*duẩn(?:\s*đà\s*nẵng))\b/i,
    unaccentedPattern: /\b(?:le\s*duan(?:\s*da\s*nang))\b/i,
    fullAddress: 'Đường Lê Duẩn, Phường Hải Châu 1, Quận Hải Châu, Đà Nẵng',
    ward: 'Phường Hải Châu 1',
  },
  {
    pattern: /\b(?:sân\s*bay\s*đà\s*nẵng)\b/i,
    unaccentedPattern: /\b(?:san\s*bay\s*da\s*nang)\b/i,
    fullAddress: 'Sân bay Quốc tế Đà Nẵng, Phường Hòa Thuận Tây, Quận Hải Châu, Đà Nẵng',
    ward: 'Phường Hòa Thuận Tây',
  },
  {
    pattern: /\b(?:bạch\s*đằng\s*đà\s*nẵng)\b/i,
    unaccentedPattern: /\b(?:bach\s*dang\s*da\s*nang)\b/i,
    fullAddress: 'Đường Bạch Đằng, Phường Hải Châu 1, Quận Hải Châu, Đà Nẵng',
    ward: 'Phường Hải Châu 1',
  },
  {
    pattern: /\b(?:nguyễn\s*văn\s*linh\s*đà\s*nẵng)\b/i,
    unaccentedPattern: /\b(?:nguyen\s*van\s*linh\s*da\s*nang)\b/i,
    fullAddress: 'Đường Nguyễn Văn Linh, Phường Nam Dương, Quận Hải Châu, Đà Nẵng',
    ward: 'Phường Nam Dương',
  },
  {
    pattern: /\b(?:cầu\s*rồng)\b/i,
    unaccentedPattern: /\b(?:cau\s*rong)\b/i,
    fullAddress: 'Khu vực Cầu Rồng, Phường Phước Ninh, Quận Hải Châu, Đà Nẵng',
    ward: 'Phường Phước Ninh',
  },
  {
    pattern: /\b(?:cầu\s*sông\s*hàn)\b/i,
    unaccentedPattern: /\b(?:cau\s*song\s*han)\b/i,
    fullAddress: 'Khu vực Cầu Sông Hàn, Phường An Hải Bắc, Quận Sơn Trà, Đà Nẵng',
    ward: 'Phường An Hải Bắc',
  },
  {
    pattern: /\b(?:chợ\s*hàn(?:\s*đà\s*nẵng)?)\b/i,
    unaccentedPattern: /\b(?:cho\s*han(?:\s*da\s*nang)?)\b/i,
    fullAddress: 'Chợ Hàn, 119 Trần Phú, Phường Hải Châu 1, Quận Hải Châu, Đà Nẵng',
    ward: 'Phường Hải Châu 1',
  },
  {
    pattern: /\b(?:chợ\s*cồn(?:\s*đà\s*nẵng)?)\b/i,
    unaccentedPattern: /\b(?:cho\s*con(?:\s*da\s*nang)?)\b/i,
    fullAddress: 'Chợ Cồn, Phường Vĩnh Trung, Quận Thanh Khê, Đà Nẵng',
    ward: 'Phường Vĩnh Trung',
  },

  // Quận trung tâm Hà Nội (tự động dịch ngược sang phường trung tâm)
  {
    pattern: /\b(?:quận\s+cầu\s+giấy|ở\s+cầu\s+giấy|cầu\s+giấy)\b/i,
    unaccentedPattern: /\b(?:quan\s+cau\s+giay|o\s+cau\s+giay|cau\s+giay)\b/i,
    fullAddress: 'Đường Cầu Giấy, Phường Quan Hoa, Quận Cầu Giấy, Hà Nội',
    ward: 'Phường Quan Hoa',
  },
  {
    pattern: /\b(?:quận\s+đống\s+đa|ở\s+đống\s+đa|đống\s+đa)\b/i,
    unaccentedPattern: /\b(?:quan\s+dong\s+da|o\s+dong\s+da|dong\s+da)\b/i,
    fullAddress: 'Phố Tây Sơn, Phường Quang Trung, Quận Đống Đa, Hà Nội',
    ward: 'Phường Quang Trung',
  },
  {
    pattern: /\b(?:quận\s+ba\s+đình|ở\s+ba\s+đình|ba\s+đình)\b/i,
    unaccentedPattern: /\b(?:quan\s+ba\s+dinh|o\s+ba\s+dinh|ba\s+dinh)\b/i,
    fullAddress: 'Phố Kim Mã, Phường Kim Mã, Quận Ba Đình, Hà Nội',
    ward: 'Phường Kim Mã',
  },
  {
    pattern: /\b(?:quận\s+hoàn\s+kiếm|ở\s+hoàn\s+kiếm|hoàn\s+kiếm)\b/i,
    unaccentedPattern: /\b(?:quan\s+hoan\s+kiem|o\s+hoan\s+kiem|hoan\s+kiem)\b/i,
    fullAddress: 'Phố Đinh Tiên Hoàng, Phường Hàng Trống, Quận Hoàn Kiếm, Hà Nội',
    ward: 'Phường Hàng Trống',
  },
  {
    pattern: /\b(?:quận\s+hai\s+bà\s+trưng|ở\s+hai\s+bà\s+trưng|hai\s+bà\s+trưng)\b/i,
    unaccentedPattern: /\b(?:quan\s+hai\s+ba\s+trung|o\s+hai\s+ba\s+trung|hai\s+ba\s+trung)\b/i,
    fullAddress: 'Phố Bạch Mai, Phường Cầu Dền, Quận Hai Bà Trưng, Hà Nội',
    ward: 'Phường Cầu Dền',
  },
  {
    pattern: /\b(?:quận\s+thanh\s+xuân|ở\s+thanh\s+xuân|thanh\s+xuân)\b/i,
    unaccentedPattern: /\b(?:quan\s+thanh\s+xuan|o\s+thanh\s+xuan|thanh\s+xuan)\b/i,
    fullAddress: 'Đường Nguyễn Trãi, Phường Thượng Đình, Quận Thanh Xuân, Hà Nội',
    ward: 'Phường Thượng Đình',
  },
  {
    pattern: /\b(?:quận\s+nam\s+từ\s+liêm|ở\s+nam\s+từ\s+liêm|nam\s+từ\s+liêm)\b/i,
    unaccentedPattern: /\b(?:quan\s+nam\s+tu\s+liem|o\s+nam\s+tu\s+liem|nam\s+tu\s+liem)\b/i,
    fullAddress: 'Đường Phạm Hùng, Phường Mễ Trì, Quận Nam Từ Liêm, Hà Nội',
    ward: 'Phường Mễ Trì',
  },
  {
    pattern: /\b(?:quận\s+bắc\s+từ\s+liêm|ở\s+bắc\s+từ\s+liêm|bắc\s+từ\s+liêm)\b/i,
    unaccentedPattern: /\b(?:quan\s+bac\s+tu\s+liem|o\s+bac\s+tu\s+liem|bac\s+tu\s+liem)\b/i,
    fullAddress: 'Đường Cầu Diễn, Phường Phúc Diễn, Quận Bắc Từ Liêm, Hà Nội',
    ward: 'Phường Phúc Diễn',
  },
  {
    pattern: /\b(?:quận\s+hà\s+đông|ở\s+hà\s+đông|hà\s+đông)\b/i,
    unaccentedPattern: /\b(?:quan\s+ha\s+dong|o\s+ha\s+dong|ha\s+dong)\b/i,
    fullAddress: 'Đường Quang Trung, Phường Quang Trung, Quận Hà Đông, Hà Nội',
    ward: 'Phường Quang Trung',
  },
  {
    pattern: /\b(?:quận\s+hoàng\s+mai|ở\s+hoàng\s+mai|hoàng\s+mai)\b/i,
    unaccentedPattern: /\b(?:quan\s+hoang\s+mai|o\s+hoang\s+mai|hoang\s+mai)\b/i,
    fullAddress: 'Đường Giải Phóng, Phường Giáp Bát, Quận Hoàng Mai, Hà Nội',
    ward: 'Phường Giáp Bát',
  },
  {
    pattern: /\b(?:quận\s+long\s+biên|ở\s+long\s+biên|long\s+biên)\b/i,
    unaccentedPattern: /\b(?:quan\s+long\s+bien|o\s+long\s+bien|long\s+bien)\b/i,
    fullAddress: 'Đường Nguyễn Văn Cừ, Phường Bồ Đề, Quận Long Biên, Hà Nội',
    ward: 'Phường Bồ Đề',
  },
  {
    pattern: /\b(?:quận\s+tây\s+hồ|ở\s+tây\s+hồ|tây\s+hồ)\b/i,
    unaccentedPattern: /\b(?:quan\s+tay\s+ho|o\s+tay\s+ho|tay\s+ho)\b/i,
    fullAddress: 'Đường Lạc Long Quân, Phường Xuân La, Quận Tây Hồ, Hà Nội',
    ward: 'Phường Xuân La',
  },

  // Quận TP. Hồ Chí Minh
  {
    pattern: /\b(?:quận\s+1|q1|ở\s+quận\s+1|ở\s+q1)\b/i,
    unaccentedPattern: /\b(?:quan\s+1|q1|o\s+quan\s+1|o\s+q1)\b/i,
    fullAddress: 'Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    ward: 'Phường Bến Nghé',
  },
  {
    pattern: /\b(?:quận\s+3|q3|ở\s+quận\s+3|ở\s+q3)\b/i,
    unaccentedPattern: /\b(?:quan\s+3|q3|o\s+quan\s+3|o\s+q3)\b/i,
    fullAddress: 'Đường Nam Kỳ Khởi Nghĩa, Phường Võ Thị Sáu, Quận 3, TP. Hồ Chí Minh',
    ward: 'Phường Võ Thị Sáu',
  },
  {
    pattern: /\b(?:quận\s+5|q5|ở\s+quận\s+5|ở\s+q5)\b/i,
    unaccentedPattern: /\b(?:quan\s+5|q5|o\s+quan\s+5|o\s+q5)\b/i,
    fullAddress: 'Đường An Dương Vương, Phường 8, Quận 5, TP. Hồ Chí Minh',
    ward: 'Phường 8',
  },
  {
    pattern: /\b(?:quận\s+7|q7|ở\s+quận\s+7|ở\s+q7)\b/i,
    unaccentedPattern: /\b(?:quan\s+7|q7|o\s+quan\s+7|o\s+q7)\b/i,
    fullAddress: 'Đường Nguyễn Thị Thập, Phường Tân Phú, Quận 7, TP. Hồ Chí Minh',
    ward: 'Phường Tân Phú',
  },
  {
    pattern: /\b(?:quận\s+10|q10|ở\s+quận\s+10|ở\s+q10)\b/i,
    unaccentedPattern: /\b(?:quan\s+10|q10|o\s+quan\s+10|o\s+q10)\b/i,
    fullAddress: 'Đường 3 Tháng 2, Phường 12, Quận 10, TP. Hồ Chí Minh',
    ward: 'Phường 12',
  },
  {
    pattern: /\b(?:quận\s+bình\s+thạnh|ở\s+bình\s+thạnh|bình\s+thạnh)\b/i,
    unaccentedPattern: /\b(?:quan\s+binh\s+thanh|o\s+binh\s+thanh|binh\s+thanh)\b/i,
    fullAddress: 'Đường Điện Biên Phủ, Phường 22, Quận Bình Thạnh, TP. Hồ Chí Minh',
    ward: 'Phường 22',
  },
  {
    pattern: /\b(?:quận\s+tân\s+bình|ở\s+tân\s+bình|tân\s+bình)\b/i,
    unaccentedPattern: /\b(?:quan\s+tan\s+binh|o\s+tan\s+binh|tan\s+binh)\b/i,
    fullAddress: 'Đường Trường Sơn, Phường 2, Quận Tân Bình, TP. Hồ Chí Minh',
    ward: 'Phường 2',
  },
  {
    pattern: /\b(?:quận\s+phú\s+nhuận|ở\s+phú\s+nhuận|phú\s+nhuận)\b/i,
    unaccentedPattern: /\b(?:quan\s+phu\s+nhuan|o\s+phu\s+nhuan|phu\s+nhuan)\b/i,
    fullAddress: 'Đường Phan Xích Long, Phường 2, Quận Phú Nhuận, TP. Hồ Chí Minh',
    ward: 'Phường 2',
  },
  {
    pattern: /\b(?:quận\s+gò\s+vấp|ở\s+gò\s+vấp|gò\s+vấp)\b/i,
    unaccentedPattern: /\b(?:quan\s+go\s+vap|o\s+go\s+vap|go\s+vap)\b/i,
    fullAddress: 'Đường Quang Trung, Phường 10, Quận Gò Vấp, TP. Hồ Chí Minh',
    ward: 'Phường 10',
  },
  {
    pattern: /\b(?:tp\s+thủ\s+đức|thủ\s+đức|ở\s+thủ\s+đức)\b/i,
    unaccentedPattern: /\b(?:tp\s+thu\s+duc|thu\s+duc|o\s+thu\s+duc)\b/i,
    fullAddress: 'Đường Võ Văn Ngân, Phường Linh Chiểu, TP. Thủ Đức, TP. Hồ Chí Minh',
    ward: 'Phường Linh Chiểu',
  },

  // Đà Nẵng
  {
    pattern: /\b(?:quận\s+hải\s+châu|hải\s+châu|ở\s+hải\s+châu)\b/i,
    unaccentedPattern: /\b(?:quan\s+hai\s+chau|hai\s+chau|o\s+hai\s+chau)\b/i,
    fullAddress: 'Đường Bạch Đằng, Phường Hải Châu 1, Quận Hải Châu, Đà Nẵng',
    ward: 'Phường Hải Châu 1',
  },
  {
    pattern: /\b(?:quận\s+sơn\s+trà|sơn\s+trà|ở\s+sơn\s+trà)\b/i,
    unaccentedPattern: /\b(?:quan\s+son\s+tra|son\s+tra|o\s+son\s+tra)\b/i,
    fullAddress: 'Đường Võ Nguyên Giáp, Phường An Hải Bắc, Quận Sơn Trà, Đà Nẵng',
    ward: 'Phường An Hải Bắc',
  },
  {
    pattern: /\b(?:quận\s+thanh\s+khê|thanh\s+khê|ở\s+thanh\s+khê)\b/i,
    unaccentedPattern: /\b(?:quan\s+thanh\s+khe|thanh\s+khe|o\s+thanh\s+khe)\b/i,
    fullAddress: 'Đường Điện Biên Phủ, Phường Chính Gián, Quận Thanh Khê, Đà Nẵng',
    ward: 'Phường Chính Gián',
  },

  // Hải Phòng
  {
    pattern: /\b(?:(?:khu\s*đô\s*thị|kđt)?\s*pg\s*an\s*đồng(?:[,\s]+(?:hải\s*phòng|hp|an\s*dương))?)\b/i,
    unaccentedPattern: /\b(?:(?:khu\s*do\s*thi|kdt)?\s*pg\s*an\s*dong(?:[,\s]+(?:hai\s*phong|hp|an\s*duong))?)\b/i,
    fullAddress: 'Khu đô thị PG An Đồng, Xã An Đồng, Huyện An Dương, Hải Phòng',
    ward: 'Xã An Đồng',
  },
  {
    pattern: /\b(?:(?:xã\s*)?an\s*đồng(?:[,\s]+(?:hải\s*phòng|hp|an\s*dương)))\b/i,
    unaccentedPattern: /\b(?:(?:xa\s*)?an\s*dong(?:[,\s]+(?:hai\s*phong|hp|an\s*duong)))\b/i,
    fullAddress: 'Xã An Đồng, Huyện An Dương, Hải Phòng',
    ward: 'Xã An Đồng',
  },
  {
    pattern: /\b(?:(?:huyện|tp|thành\s*phố)?\s*thủy\s*nguyên(?:[,\s]+(?:hải\s*phòng|hp))?|núi\s*đèo)\b/i,
    unaccentedPattern: /\b(?:(?:huyen|tp|thanh\s*pho)?\s*thuy\s*nguyen(?:[,\s]+(?:hai\s*phong|hp))?|nui\s*deo)\b/i,
    fullAddress: 'Khu vực Thị trấn Núi Đèo, Huyện Thủy Nguyên, Hải Phòng',
    ward: 'Thị trấn Núi Đèo',
  },
  {
    pattern: /\b(?:vinhomes\s*marina|marina\s*cầu\s*rào)\b/i,
    unaccentedPattern: /\b(?:vinhomes\s*marina|marina\s*cau\s*rao)\b/i,
    fullAddress: 'Khu đô thị Vinhomes Marina, Phường Vĩnh Niệm, Quận Lê Chân, Hải Phòng',
    ward: 'Phường Vĩnh Niệm',
  },
  {
    pattern: /\b(?:vinhomes\s*imperia|imperia\s*hải\s*phòng)\b/i,
    unaccentedPattern: /\b(?:vinhomes\s*imperia|imperia\s*hai\s*phong)\b/i,
    fullAddress: 'Khu đô thị Vinhomes Imperia, Phường Thượng Lý, Quận Hồng Bàng, Hải Phòng',
    ward: 'Phường Thượng Lý',
  },
  {
    pattern: /\b(?:hoàng\s*huy\s*(?:pruksa|an\s*đồng)|pruksa\s*town)\b/i,
    unaccentedPattern: /\b(?:hoang\s*huy\s*(?:pruksa|an\s*dong)|pruksa\s*town)\b/i,
    fullAddress: 'KĐT Hoàng Huy Pruksa Town, Xã An Đồng, Huyện An Dương, Hải Phòng',
    ward: 'Xã An Đồng',
  },
  {
    pattern: /\b(?:aeon\s*mall\s*hải\s*phòng|aeon\s*hải\s*phòng|aeon\s*lê\s*chân)\b/i,
    unaccentedPattern: /\b(?:aeon\s*mall\s*hai\s*phong|aeon\s*hai\s*phong|aeon\s*le\s*chan)\b/i,
    fullAddress: 'Aeon Mall Hải Phòng Lê Chân, 10 Võ Nguyên Giáp, Phường Kênh Dương, Quận Lê Chân, Hải Phòng',
    ward: 'Phường Kênh Dương',
  },
  {
    pattern: /\b(?:sân\s*bay\s*cát\s*bi|cát\s*bi)\b/i,
    unaccentedPattern: /\b(?:san\s*bay\s*cat\s*bi|cat\s*bi)\b/i,
    fullAddress: 'Sân bay Quốc tế Cát Bi, Đường Lê Hồng Phong, Phường Thành Tô, Quận Hải An, Hải Phòng',
    ward: 'Phường Thành Tô',
  },
  {
    pattern: /\b(?:bến\s*xe\s*vĩnh\s*niệm|bx\s*vĩnh\s*niệm)\b/i,
    unaccentedPattern: /\b(?:ben\s*xe\s*vinh\s*niem|bx\s*vinh\s*niem)\b/i,
    fullAddress: 'Bến xe Vĩnh Niệm, Đường Bùi Viện, Phường Vĩnh Niệm, Quận Lê Chân, Hải Phòng',
    ward: 'Phường Vĩnh Niệm',
  },
  {
    pattern: /\b(?:bến\s*xe\s*cầu\s*rào|bx\s*cầu\s*rào)\b/i,
    unaccentedPattern: /\b(?:ben\s*xe\s*cau\s*rao|bx\s*cau\s*rao)\b/i,
    fullAddress: 'Bến xe Cầu Rào, Đường Lạch Tray, Phường Đằng Giang, Quận Ngô Quyền, Hải Phòng',
    ward: 'Phường Đằng Giang',
  },
  {
    pattern: /\b(?:quận\s*lê\s*chân|lê\s*chân(?:\s*hải\s*phòng)?)\b/i,
    unaccentedPattern: /\b(?:quan\s*le\s*chan|le\s*chan(?:\s*hai\s*phong)?)\b/i,
    fullAddress: 'Đường Tô Hiệu, Phường Trại Cau, Quận Lê Chân, Hải Phòng',
    ward: 'Phường Trại Cau',
  },
  {
    pattern: /\b(?:quận\s*ngô\s*quyền|ngô\s*quyền(?:\s*hải\s*phòng)?)\b/i,
    unaccentedPattern: /\b(?:quan\s*ngo\s*quyen|ngo\s*quyen(?:\s*hai\s*phong)?)\b/i,
    fullAddress: 'Đường Lạch Tray, Phường Lạch Tray, Quận Ngô Quyền, Hải Phòng',
    ward: 'Phường Lạch Tray',
  },
  {
    pattern: /\b(?:quận\s*hồng\s*bàng|hồng\s*bàng(?:\s*hải\s*phòng)?)\b/i,
    unaccentedPattern: /\b(?:quan\s*hong\s*bang|hong\s*bang(?:\s*hai\s*phong)?)\b/i,
    fullAddress: 'Đường Quang Trung, Phường Hoàng Văn Thụ, Quận Hồng Bàng, Hải Phòng',
    ward: 'Phường Hoàng Văn Thụ',
  },
  {
    pattern: /\b(?:quận\s*hải\s*an|hải\s*an(?:\s*hải\s*phòng)?)\b/i,
    unaccentedPattern: /\b(?:quan\s*hai\s*an|hai\s*an(?:\s*hai\s*phong)?)\b/i,
    fullAddress: 'Đường Lê Hồng Phong, Phường Đằng Hải, Quận Hải An, Hải Phòng',
    ward: 'Phường Đằng Hải',
  },
  {
    pattern: /\b(?:huyện\s*an\s*dương|an\s*dương(?:\s*hải\s*phòng)?)\b/i,
    unaccentedPattern: /\b(?:huyen\s*an\s*duong|an\s*duong(?:\s*hai\s*phong)?)\b/i,
    fullAddress: 'Thị trấn An Dương, Huyện An Dương, Hải Phòng',
    ward: 'Thị trấn An Dương',
  },
  {
    pattern: /\b(?:đồ\s*sơn(?:\s*hải\s*phòng)?)\b/i,
    unaccentedPattern: /\b(?:do\s*son(?:\s*hai\s*phong)?)\b/i,
    fullAddress: 'Khu du lịch Đồ Sơn, Phường Vạn Hương, Quận Đồ Sơn, Hải Phòng',
    ward: 'Phường Vạn Hương',
  },

  // Quảng Ninh
  {
    pattern: /\b(?:(?:phường|khu\s*vực)?\s*bãi\s*cháy(?:[,\s]+(?:quảng\s*ninh|qn|hạ\s*long))?)\b/i,
    unaccentedPattern: /\b(?:(?:phuong|khu\s*vuc)?\s*bai\s*chay(?:[,\s]+(?:quang\s*ninh|qn|ha\s*long))?)\b/i,
    fullAddress: 'Khu vực Bãi Cháy, Phường Bãi Cháy, Thành phố Hạ Long, Quảng Ninh',
    ward: 'Phường Bãi Cháy',
  },
  {
    pattern: /\b(?:(?:phường|khu\s*vực)?\s*(?:hòn\s*gai|hồng\s*gai)(?:[,\s]+(?:quảng\s*ninh|qn|hạ\s*long))?)\b/i,
    unaccentedPattern: /\b(?:(?:phuong|khu\s*vuc)?\s*(?:hon\s*gai|hong\s*gai)(?:[,\s]+(?:quang\s*ninh|qn|ha\s*long))?)\b/i,
    fullAddress: 'Khu vực Hòn Gai, Phường Hồng Gai, Thành phố Hạ Long, Quảng Ninh',
    ward: 'Phường Hồng Gai',
  },
  {
    pattern: /\b(?:(?:đảo|khu\s*du\s*lịch|phường)?\s*tuần\s*châu(?:[,\s]+(?:quảng\s*ninh|qn|hạ\s*long))?)\b/i,
    unaccentedPattern: /\b(?:(?:dao|khu\s*du\s*lich|phuong)?\s*tuan\s*chau(?:[,\s]+(?:quang\s*ninh|qn|ha\s*long))?)\b/i,
    fullAddress: 'Khu du lịch Tuần Châu, Phường Tuần Châu, Thành phố Hạ Long, Quảng Ninh',
    ward: 'Phường Tuần Châu',
  },
  {
    pattern: /\b(?:tp\s*hạ\s*long|thành\s*phố\s*hạ\s*long|ở\s*hạ\s*long)\b/i,
    unaccentedPattern: /\b(?:tp\s*ha\s*long|thanh\s*pho\s*ha\s*long|o\s*ha\s*long)\b/i,
    fullAddress: 'Đường Lê Thánh Tông, Phường Hồng Gai, Thành phố Hạ Long, Quảng Ninh',
    ward: 'Phường Hồng Gai',
  },
  {
    pattern: /\b(?:tp\s*cẩm\s*phả|thành\s*phố\s*cẩm\s*phả|cẩm\s*phả(?:\s*quảng\s*ninh)?)\b/i,
    unaccentedPattern: /\b(?:tp\s*cam\s*pha|thanh\s*pho\s*cam\s*pha|cam\s*pha(?:\s*quang\s*ninh)?)\b/i,
    fullAddress: 'Đường Trần Phú, Phường Cẩm Trung, Thành phố Cẩm Phả, Quảng Ninh',
    ward: 'Phường Cẩm Trung',
  },
  {
    pattern: /\b(?:tp\s*uông\s*bí|thành\s*phố\s*uông\s*bí|uông\s*bí(?:\s*quảng\s*ninh)?)\b/i,
    unaccentedPattern: /\b(?:tp\s*uong\s*bi|thanh\s*pho\s*uong\s*bi|uong\s*bi(?:\s*quang\s*ninh)?)\b/i,
    fullAddress: 'Đường Quang Trung, Phường Quang Trung, Thành phố Uông Bí, Quảng Ninh',
    ward: 'Phường Quang Trung',
  },
  {
    pattern: /\b(?:tp\s*móng\s*cái|thành\s*phố\s*móng\s*cái|móng\s*cái(?:\s*quảng\s*ninh)?)\b/i,
    unaccentedPattern: /\b(?:tp\s*mong\s*cai|thanh\s*pho\s*mong\s*cai|mong\s*cai(?:\s*quang\s*ninh)?)\b/i,
    fullAddress: 'Đường Hùng Vương, Phường Trần Phú, Thành phố Móng Cái, Quảng Ninh',
    ward: 'Phường Trần Phú',
  },

  // Hưng Yên & Bắc Ninh
  {
    pattern: /\b(?:kđt\s*ecopark|khu\s*đô\s*thị\s*ecopark)\b/i,
    unaccentedPattern: /\b(?:kdt\s*ecopark|khu\s*do\s*thi\s*ecopark)\b/i,
    fullAddress: 'Khu đô thị Ecopark, Xã Xuân Quan, Huyện Văn Giang, Hưng Yên',
    ward: 'Xã Xuân Quan',
  },
  {
    pattern: /\b(?:tp\s*bắc\s*ninh|thành\s*phố\s*bắc\s*ninh)\b/i,
    unaccentedPattern: /\b(?:tp\s*bac\s*ninh|thanh\s*pho\s*bac\s*ninh)\b/i,
    fullAddress: 'Đường Trần Hưng Đạo, Phường Tiền An, Thành phố Bắc Ninh, Bắc Ninh',
    ward: 'Phường Tiền An',
  },
  {
    pattern: /\b(?:tp\s*từ\s*sơn|thành\s*phố\s*từ\s*sơn|từ\s*sơn(?:\s*bắc\s*ninh)?)\b/i,
    unaccentedPattern: /\b(?:tp\s*tu\s*son|thanh\s*pho\s*tu\s*son|tu\s*son(?:\s*bac\s*ninh)?)\b/i,
    fullAddress: 'Đường Lý Thái Tổ, Phường Đông Ngàn, Thành phố Từ Sơn, Bắc Ninh',
    ward: 'Phường Đông Ngàn',
  },
];

export function checkHasWardCommune(address: string | undefined): boolean {
  if (!address || typeof address !== 'string') return false;
  const trimmed = address.trim();
  if (trimmed.length < 3) return false;
  const lower = trimmed.toLowerCase();
  const unaccented = removeVietnameseDiacritics(trimmed);

  // Check if it is a Google Maps share link or coordinate
  const gmapCheck = parseGoogleMapsLocation(trimmed);
  if (gmapCheck && gmapCheck.hasWardCommune) {
    return true;
  }

  // Check against full Vietnam Administrative resolution
  const adminCheck = resolveAdministrativeAddress(trimmed);
  if (adminCheck && adminCheck.hasWardCommune) {
    return true;
  }

  // Explicit keywords: phường, p., p [number/name], xã, x., thị trấn, tt., tt [name]
  if (
    /(?:phường|p\.|p\s*\d+|p\s+[a-zà-ỹ]+)\b/i.test(lower) ||
    /(?:xã|x\.|x\s+[a-zà-ỹ]+)\b/i.test(lower) ||
    /(?:thị trấn|tt\.|tt\s+[a-zà-ỹ]+)\b/i.test(lower) ||
    /(?:phuong|p\.|xa|thi\s*tran)\b/i.test(unaccented)
  ) {
    return true;
  }

  // Check landmark patterns
  for (const item of LANDMARK_REVERSE_GEOCODE) {
    if (item.pattern.test(lower) || item.unaccentedPattern.test(unaccented)) {
      return true;
    }
  }

  // Famous Vietnamese wards/communes
  const knownWards = [
    'bến nghé', 'bến thành', 'tân định', 'đa kao', 'cầu kho', 'cầu ông lãnh', 'cô giang',
    'nguyễn cư trinh', 'nguyễn thái bình', 'phạm ngũ lão', 'võ thị sáu', 'tân thuận đông',
    'dịch vọng', 'dịch vọng hậu', 'quan hoa', 'trung hòa', 'nghĩa tân', 'nghĩa đô', 'mai dịch', 'yên hòa',
    'hàng bạc', 'hàng bài', 'hàng bồ', 'hàng bông', 'hàng buồm', 'hàng đào', 'hàng gai', 'hàng mã',
    'tràng tiền', 'cửa đông', 'cửa nam', 'phúc tân', 'phố huế', 'bạch đằng', 'bách khoa',
    'phan chu trinh', 'lý thái tổ', 'hàng trống', 'lê đại hành', 'cầu dền', 'đồng tâm', 'nam đồng',
    'quang trung', 'trung liệt', 'láng thượng', 'láng hạ', 'cống vị', 'ngọc hà', 'ngọc khánh',
    'giảng võ', 'kim mã', 'xuân la', 'phú thượng', 'bồ đề', 'gia thụy', 'đức giang', 'tây mỗ',
    'đại mỗ', 'phúc diễn', 'mộ lao', 'vạn phúc', 'thượng đình', 'thanh xuân bắc', 'nhân chính',
    'thạch thang', 'hải châu 1', 'hải châu 2', 'hòa cường bắc', 'hòa cường nam', 'nam dương',
    'phước ninh', 'bình thuận', 'thanh bình', 'thuận phước', 'mỹ an', 'khuê mỹ', 'an hải bắc',
    'mễ trì', 'mỹ đình', 'mỹ đình 1', 'mỹ đình 2', 'nhân chính', 'khương trung', 'khương mai',
    'bãi cháy', 'hồng gai', 'hòn gai', 'tuần châu', 'cao xanh', 'cao thắng', 'hà lầm', 'hà trung', 'hà phong', 'hà tu', 'hà khẩu', 'giếng đáy', 'hùng thắng', 'hồng hải', 'cẩm trung', 'cẩm thành',
    'an đồng', 'núi đèo', 'thủy đường', 'vĩnh niệm', 'thượng lý', 'hạ lý', 'sở dầu', 'quán toan', 'trại chuối', 'minh khai', 'hoàng văn thụ', 'đằng giang', 'đằng lâm', 'cầu đất', 'lương khánh thiện', 'máy tơ', 'vạn mỹ', 'đông khê', 'gia viên', 'trần thành ngọ', 'vạn hương',
    'núi đối', 'tiên lãng', 'vĩnh bảo', 'cát bà', 'cái rồng', 'xuân quan', 'nghĩa trụ', 'đông ngàn', 'tiền an', 'suối hoa'
  ];

  for (const w of knownWards) {
    if (lower.includes(w) || unaccented.includes(removeVietnameseDiacritics(w))) {
      return true;
    }
  }

  return false;
}

export function reverseGeocodeAddress(raw: string | undefined | null): { address: string; hasWardCommune: boolean } {
  if (!raw || typeof raw !== 'string') {
    return { address: '', hasWardCommune: false };
  }
  if (isNotValidAddress(raw)) {
    return { address: '', hasWardCommune: false };
  }
  const clean = cleanAddressText(raw);
  if (!clean || isNotValidAddress(clean)) return { address: '', hasWardCommune: false };
  const unaccented = removeVietnameseDiacritics(clean);

  // 0. Check if input is a Google Maps share link, pin URL or GPS coordinate
  const gmap = parseGoogleMapsLocation(clean);
  if (gmap && gmap.hasWardCommune) {
    return gmap;
  }

  // Normalize common abbreviations (HN -> Hà Nội, HCM -> TP. Hồ Chí Minh, ĐN -> Đà Nẵng, HP -> Hải Phòng, QN -> Quảng Ninh, Q1 -> Quận 1)
  const normalized = clean
    .replace(/\bhn\b/gi, 'Hà Nội')
    .replace(/\b(?:hcm|tphcm|sg)\b/gi, 'TP. Hồ Chí Minh')
    .replace(/\b(?:đn|dn)\b/gi, 'Đà Nẵng')
    .replace(/\bhp\b/gi, 'Hải Phòng')
    .replace(/\bqn\b/gi, 'Quảng Ninh')
    .replace(/\bbn\b/gi, 'Bắc Ninh')
    .replace(/\bhy\b/gi, 'Hưng Yên')
    .replace(/\bhd\b/gi, 'Hải Dương')
    .replace(/\bq\.?\s*(\d+)\b/gi, 'Quận $1')
    .replace(/\btx\b/gi, 'Thanh Xuân')
    .replace(/\bcg\b/gi, 'Cầu Giấy')
    .replace(/\bhk\b/gi, 'Hoàn Kiếm');
  const normalizedUnaccented = removeVietnameseDiacritics(normalized);

  // 0.5. If address ALREADY has an explicit ward or commune (e.g. "Phường Vạn Phúc", "Phường Bắc Sơn"),
  // preserve it as-is! NEVER overwrite with generic centerWard!
  const hasExplicitWard =
    /(?:phường|p\.|xã|x\.|thị trấn|tt\.)\s+[a-zà-ỹ0-9]+/i.test(clean) ||
    /(?:phuong|p\.|xa|thi\s*tran)\s+[a-z0-9]+/i.test(unaccented);
  if (hasExplicitWard) {
    return { address: clean, hasWardCommune: true };
  }

  // 1. Check against full Vietnam Administrative units (63 provinces & all districts/wards)
  const adminRes = resolveAdministrativeAddress(clean);
  if (adminRes.hasWardCommune) {
    return { address: adminRes.fullAddress, hasWardCommune: true };
  }
  const adminNorm = resolveAdministrativeAddress(normalized);
  if (adminNorm.hasWardCommune) {
    return { address: adminNorm.fullAddress, hasWardCommune: true };
  }

  // 2. Check dictionary of famous landmarks / roads
  for (const item of LANDMARK_REVERSE_GEOCODE) {
    if (
      item.pattern.test(clean) ||
      item.unaccentedPattern.test(unaccented) ||
      item.pattern.test(normalized) ||
      item.unaccentedPattern.test(normalizedUnaccented)
    ) {
      const numMatch =
        clean.match(/(?:số\s+|phòng\s+|căn\s+|tầng\s+)(\d+[a-zA-Z]?(?:\/\d+)*)\b/i) ||
        clean.match(/^(\d+[a-zA-Z]?(?:\/\d+)*)\s+/i);
      if (numMatch && !item.fullAddress.includes(numMatch[1])) {
        return {
          address: `${numMatch[0].trim()} ${item.fullAddress}`,
          hasWardCommune: true,
        };
      }
      return {
        address: item.fullAddress,
        hasWardCommune: true,
      };
    }
  }

  // 2. Check if address already explicitly has ward or commune
  if (checkHasWardCommune(clean) || checkHasWardCommune(normalized)) {
    return { address: clean, hasWardCommune: true };
  }

  // 3. Smart street & regional heuristics (reverse geocoding to administrative wards)
  if (/pg\s*an\s*đồng/i.test(clean) || /pg\s*an\s*dong/i.test(unaccented)) {
    const numMatch = clean.match(/(?:số\s+)?(\d+[a-zA-Z]?(?:\/\d+)*)/i);
    const prefix = numMatch ? `${numMatch[0].trim()} ` : '';
    return {
      address: `${prefix}Khu đô thị PG An Đồng, Xã An Đồng, Huyện An Dương, Hải Phòng`,
      hasWardCommune: true,
    };
  }
  if (/thủy\s*nguyên/i.test(clean) || /thuy\s*nguyen/i.test(unaccented)) {
    return {
      address: `Khu vực Thị trấn Núi Đèo, Huyện Thủy Nguyên, Hải Phòng`,
      hasWardCommune: true,
    };
  }
  if (/bãi\s*cháy/i.test(clean) || /bai\s*chay/i.test(unaccented)) {
    return {
      address: `Khu vực Bãi Cháy, Phường Bãi Cháy, Thành phố Hạ Long, Quảng Ninh`,
      hasWardCommune: true,
    };
  }
  if (/hòn\s*gai|hồng\s*gai/i.test(clean) || /hon\s*gai|hong\s*gai/i.test(unaccented)) {
    return {
      address: `Khu vực Hòn Gai, Phường Hồng Gai, Thành phố Hạ Long, Quảng Ninh`,
      hasWardCommune: true,
    };
  }
  if (/tuần\s*châu/i.test(clean) || /tuan\s*chau/i.test(unaccented)) {
    return {
      address: `Khu du lịch Tuần Châu, Phường Tuần Châu, Thành phố Hạ Long, Quảng Ninh`,
      hasWardCommune: true,
    };
  }
  if (/(?:xã\s*)?an\s*đồng/i.test(clean) && /(?:hải\s*phòng|hp|an\s*dương)/i.test(clean)) {
    return {
      address: `Xã An Đồng, Huyện An Dương, Hải Phòng`,
      hasWardCommune: true,
    };
  }
  if (/lê\s*thánh\s*tông/i.test(clean) || /le\s*thanh\s*tong/i.test(unaccented)) {
    const numMatch = clean.match(/(?:số\s+)?(\d+[a-zA-Z]?(?:\/\d+)*)/i);
    const prefix = numMatch ? `${numMatch[0].trim()} ` : '';
    return {
      address: `${prefix}Đường Lê Thánh Tông, Phường Phan Chu Trinh, Quận Hoàn Kiếm, Hà Nội`,
      hasWardCommune: true,
    };
  }
  if (/cầu\s*giấy/i.test(clean) && /\d+/.test(clean)) {
    return { address: `${clean}, Phường Quan Hoa, Quận Cầu Giấy, Hà Nội`, hasWardCommune: true };
  }
  if (/trần\s*duy\s*hưng/i.test(clean)) {
    return { address: `${clean}, Phường Trung Hòa, Quận Cầu Giấy, Hà Nội`, hasWardCommune: true };
  }
  if (/chùa\s*láng/i.test(clean)) {
    return { address: `${clean}, Phường Láng Thượng, Quận Đống Đa, Hà Nội`, hasWardCommune: true };
  }
  if (/duy\s*tân/i.test(clean)) {
    return { address: `${clean}, Phường Dịch Vọng Hậu, Quận Cầu Giấy, Hà Nội`, hasWardCommune: true };
  }
  if (/lê\s*duẩn/i.test(clean) && (/đà\s*nẵng/i.test(clean) || /dn|đn/i.test(clean) || !/hà\s*nội|hn/i.test(clean))) {
    return { address: `${clean}, Phường Hải Châu 1, Quận Hải Châu, Đà Nẵng`, hasWardCommune: true };
  }
  if (/nguyễn\s*huệ/i.test(clean) && /(?:q1|quận\s*1|hcm|hồ\s*chí\s*minh|sg)/i.test(clean)) {
    return { address: `${clean}, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh`, hasWardCommune: true };
  }
  if (/lê\s*lợi/i.test(clean) && /(?:q1|quận\s*1|hcm|hồ\s*chí\s*minh|sg)/i.test(clean)) {
    return { address: `${clean}, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh`, hasWardCommune: true };
  }
  if (/bùi\s*viện/i.test(clean)) {
    return { address: `${clean}, Phường Phạm Ngũ Lão, Quận 1, TP. Hồ Chí Minh`, hasWardCommune: true };
  }

  // Cannot reverse geocode to detailed ward/commune (e.g. only "Hà Nội", "Đà Nẵng", "Cầu Giấy", "Quận 1")
  return { address: clean, hasWardCommune: false };
}

export function smartExtractVietnamese(text: string, current: any) {
  const updated = JSON.parse(JSON.stringify(current || {}));
  if (!updated.sender) updated.sender = { name: '', phone: '', address: '' };
  if (!updated.receiver) updated.receiver = { name: '', phone: '', address: '' };
  if (!updated.cargo) {
    updated.cargo = {
      name: '',
      weight: '',
      weightKg: null,
      dimensions: { length: null, width: null, height: null, raw: '' },
      category: 'Hàng tiêu dùng / Bưu phẩm',
      specialNotes: '',
    };
  }

  // 1. Detect phone numbers & invalid phone attempts
  let invalidSenderPhoneAttempt = false;
  let invalidReceiverPhoneAttempt = false;

  // Find candidate phone sequences in text (e.g. 0912345678, +84912345678, 0912 345 678, 0912-345-678, 091234567, 9123456789)
  const phonePattern = /(?:\+84|0|\b)[0-9\s.-]{7,15}\b/g;
  const rawCandidates = text.match(phonePattern) || [];

  const validPhones: string[] = [];
  for (const raw of rawCandidates) {
    const cleaned = cleanPhoneNumber(raw);
    if (/^\d{7,13}$/.test(cleaned)) {
      if (isValidVNPhone(cleaned)) {
        if (!validPhones.includes(cleaned)) {
          validPhones.push(cleaned);
        }
      } else {
        // Attempted phone number, but invalid format!
        const pos = text.indexOf(raw);
        const prefix = text.substring(Math.max(0, pos - 40), pos).toLowerCase();
        if (/(?:người gửi|bên gửi|từ|lấy)/i.test(prefix)) {
          invalidSenderPhoneAttempt = true;
        } else if (/(?:người nhận|bên nhận|cho|đến|tới|giao)/i.test(prefix)) {
          invalidReceiverPhoneAttempt = true;
        } else if (!updated.sender.phone) {
          invalidSenderPhoneAttempt = true;
        } else {
          invalidReceiverPhoneAttempt = true;
        }
      }
    }
  }

  // Check specific sender and receiver phone context
  const senderPhoneMatch = text.match(/(?:người gửi|từ|bên gửi)[^0-9]*?([0-9\s.+-]{7,15})/i);
  const receiverPhoneMatch = text.match(/(?:người nhận|cho|đến|tới|bên nhận)[^0-9]*?([0-9\s.+-]{7,15})/i);

  if (senderPhoneMatch) {
    const sClean = cleanPhoneNumber(senderPhoneMatch[1]);
    if (isValidVNPhone(sClean)) {
      updated.sender.phone = sClean;
      invalidSenderPhoneAttempt = false;
    } else if (sClean.length >= 7) {
      invalidSenderPhoneAttempt = true;
      updated.sender.phone = '';
    }
  } else if (!updated.sender.phone && validPhones[0]) {
    updated.sender.phone = validPhones[0];
  }

  if (receiverPhoneMatch) {
    const rClean = cleanPhoneNumber(receiverPhoneMatch[1]);
    if (isValidVNPhone(rClean)) {
      updated.receiver.phone = rClean;
      invalidReceiverPhoneAttempt = false;
    } else if (rClean.length >= 7) {
      invalidReceiverPhoneAttempt = true;
      updated.receiver.phone = '';
    }
  } else if (validPhones[1] && validPhones[1] !== updated.sender.phone) {
    updated.receiver.phone = validPhones[1];
  } else if (!updated.receiver.phone && validPhones[0] && validPhones[0] !== updated.sender.phone) {
    updated.receiver.phone = validPhones[0];
  }

  // Ensure any existing phone is valid; if invalid, clear it
  if (updated.sender.phone && !isValidVNPhone(updated.sender.phone)) {
    invalidSenderPhoneAttempt = true;
    updated.sender.phone = '';
  }
  if (updated.receiver.phone && !isValidVNPhone(updated.receiver.phone)) {
    invalidReceiverPhoneAttempt = true;
    updated.receiver.phone = '';
  }

  // 2. Detect Weight (e.g., 5kg, 350g, chưa đến 1kg, dưới 2kg, khoảng 5kg)
  const weightMatch = text.match(/(?:(?:chưa\s*(?:đến|tới)|dưới|<|khoảng|tầm|tầm\s*khoảng|hơn|>)\s*)?(\d+(?:[.,]\d+)?)\s*(kg|kilo|kilogram|cân|lạng|g|gram|tạ|yến|tấn)\b/i);
  if (weightMatch) {
    const rawMatch = weightMatch[0].trim();
    const num = parseFloat(weightMatch[1].replace(',', '.'));
    const unit = weightMatch[2].toLowerCase();
    let kg = num;
    if (unit === 'g' || unit === 'gram') kg = num / 1000;
    if (unit === 'tấn') kg = num * 1000;
    if (unit === 'lạng') kg = num * 0.1;

    if (/chưa\s*(?:đến|tới)|dưới|</i.test(rawMatch)) {
      updated.cargo.weight = `< ${num}kg`;
      updated.cargo.specialNotes = rawMatch;
    } else if (/khoảng|tầm/i.test(rawMatch)) {
      updated.cargo.weight = `Khoảng ${num} ${unit}`;
    } else {
      updated.cargo.weight = `${num} ${unit}`;
    }
    updated.cargo.weightKg = Number(kg.toFixed(2));
  }

  // 3. Detect Dimensions (e.g., 40x30x30 or 40*30*30 or 40 x 30 x 30)
  const dimMatch = text.match(/(\d+)\s*[xX*×]\s*(\d+)\s*[xX*×]\s*(\d+)/);
  if (dimMatch) {
    const l = parseInt(dimMatch[1], 10);
    const w = parseInt(dimMatch[2], 10);
    const h = parseInt(dimMatch[3], 10);
    updated.cargo.dimensions = {
      length: l,
      width: w,
      height: h,
      raw: `${l}x${w}x${h} cm`,
    };
  }

  // 4. Detect Sender Name (Optional)
  const senderNameMatch = text.match(/(?:người gửi|từ)\s*(?::|là)?\s*(?:anh|chị|ông|bà|cô|chú|em)\s+([A-ZÀ-Ỹ][a-zà-ỹA-ZÀ-Ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹA-ZÀ-Ỹ]+){0,3}?)(?=\s+(?:SĐT|sđt|đt|số|ở|tại|lấy|0\d|\+84))/i)
    || text.match(/(?:người gửi:)\s*([A-ZÀ-Ỹ][a-zà-ỹA-ZÀ-Ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹA-ZÀ-Ỹ]+){0,3}?)/i);
  if (senderNameMatch && senderNameMatch[1]) {
    const candidate = senderNameMatch[1].trim();
    if (!/^(sđt|số|đt|phone|kho|bên)$/i.test(candidate)) {
      updated.sender.name = candidate;
    }
  }

  // 5. Detect Receiver Name (Optional)
  const receiverNameMatch = text.match(/(?:người nhận|gửi cho|cho|đến|tới)\s*(?::|là)?\s*(?:anh|chị|ông|bà|cô|chú|em)\s+([A-ZÀ-Ỹ][a-zà-ỹA-ZÀ-Ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹA-ZÀ-Ỹ]+){0,3}?)(?=\s+(?:SĐT|sđt|đt|số|ở|tại|lấy|0\d|\+84))/i)
    || text.match(/(?:người nhận:)\s*([A-ZÀ-Ỹ][a-zà-ỹA-ZÀ-Ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹA-ZÀ-Ỹ]+){0,3}?)/i);
  if (receiverNameMatch && receiverNameMatch[1]) {
    const candidate = receiverNameMatch[1].trim();
    if (!/^(sđt|số|đt|phone|kho|bên)$/i.test(candidate) && candidate.toLowerCase() !== updated.sender.name?.toLowerCase()) {
      updated.receiver.name = candidate;
    }
  }

  // 6. Detect Addresses (Sender & Receiver)
  const isCorrection = isUserCorrectionMessage(text);
  const isChatNoiseOrQuestion = isConversationalOrQuestion(text);
  // Guard: Nếu khách chỉ đang trả lời về thời gian giao nhận (VD: "Qua lấy, giao trong ngày hoặc sang hôm sau cũng đc") -> KHÔNG tách địa chỉ!
  const hasAnyAddressKeyword = ADDR_KEYWORD_REGEX.test(text);
  const isPureDeliveryTimeReply =
    (Boolean(detectDeliveryTime(text)) && !hasAnyAddressKeyword) ||
    (!hasAnyAddressKeyword && /(?:cũng\s+(?:được|đc)|tùy\s+bên\s+em|lúc\s+nào\s+cũng|hôm\s+sau|sang\s+hôm\s+sau)/i.test(text));
  const skipAddressExtraction = isPureDeliveryTimeReply || (isChatNoiseOrQuestion && !hasAnyAddressKeyword);

  // Step 6A: Check Pattern A: "từ [SENDER] (đi|đến|tới|sang|vào|về|xuống|lên|ra|giao đến|giao tới) [RECEIVER]"
  const tuMatch = text.match(/(?:^|\s+)từ\s+(.+?)\s+(?:đi|đến|tới|sang|vào|về|xuống|lên|ra|giao(?:\s+(?:đến|tới|vào|sang|về|xuống|lên|ra|ở|tại|cho))?)\s+([^;\n]+)/i);

  // Step 6B: Check Pattern B: "lấy [ở|tại] [SENDER] (giao|chuyển|gửi|đến|tới|sang|vào|về|xuống|lên|ra|đi) [RECEIVER]"
  const layMatch = text.match(/(?:lấy(?:\s+hàng)?(?:\s+(?:ở|tại))?)\s+(.+?)\s+(?:giao|chuyển(?:\s+đến)?|gửi(?:\s+đến)?|đến|tới|sang|vào|về|xuống|lên|ra|đi)(?:\s+(?:đến|tới|ở|tại|vào|sang|về|xuống|lên|ra|cho))?\s+([^;\n]+)/i);

  // Step 6C: Check landmarks from dictionary, keeping longest non-overlapping matches
  const foundLandmarks: Array<{ fullAddress: string; ward: string; matchIndex: number; matchLength: number }> = [];
  const cleanLower = text.toLowerCase();
  const cleanUnaccented = removeVietnameseDiacritics(text);

  for (const item of LANDMARK_REVERSE_GEOCODE) {
    const m1 = cleanLower.match(item.pattern);
    if (m1 && m1.index !== undefined) {
      foundLandmarks.push({ fullAddress: item.fullAddress, ward: item.ward, matchIndex: m1.index, matchLength: m1[0].length });
      continue;
    }
    const m2 = cleanUnaccented.match(item.unaccentedPattern);
    if (m2 && m2.index !== undefined) {
      foundLandmarks.push({ fullAddress: item.fullAddress, ward: item.ward, matchIndex: m2.index, matchLength: m2[0].length });
    }
  }

  // Sort by matchLength descending so longer, more specific matches win over sub-string matches
  foundLandmarks.sort((a, b) => b.matchLength - a.matchLength);
  const distinctLandmarks: Array<{ fullAddress: string; ward: string; matchIndex: number; matchLength: number }> = [];
  for (const lm of foundLandmarks) {
    const overlaps = distinctLandmarks.some(d =>
      (lm.matchIndex < d.matchIndex + d.matchLength) && (d.matchIndex < lm.matchIndex + lm.matchLength)
    );
    if (!overlaps) {
      distinctLandmarks.push(lm);
    }
  }
  // Re-sort distinct landmarks by matchIndex appearance in sentence
  distinctLandmarks.sort((a, b) => a.matchIndex - b.matchIndex);

  // Step 6D: Check General Split Separator (Avoid matching bare 'chuyển', 'gửi' or 'giao' without destination prepositions!)
  // IMPORTANT: Do NOT match 'đến' / 'tới' if preceded by 'chưa' / 'dưới' / 'tầm' / 'khoảng' or followed by weight/dimension units!
  const splitRegex = /(?:,\s*|\s+)(?:giao\s+(?:đến|tới|sang|vào|về|xuống|lên|ra|qua|tại|ở|cho)|chuyển\s+(?:đến|tới|sang|vào|về|xuống|lên|ra|qua)|gửi\s+(?:đến|tới|sang|vào|về|xuống|lên|ra|qua)|(?<!(?:chưa|dưới|khoảng|tầm)\s+)(?:đến|tới|sang|vào|về|xuống|lên|ra|đi))\s+(?!\d+\s*(?:kg|kilo|kilogram|cân|lạng|g|gram|tạ|yến|tấn|cm|m|mm|trang|cuốn|chiếc|cái|kiện|tầng|lầu)\b)/i;
  const splitMatch = text.match(splitRegex);

  let senderCandidate = '';
  let receiverCandidate = '';

  const hasSenderKeyword = /(?:^|\s+)(?:lấy\s+(?:hàng\s+)?(?:ở|tại)|gửi\s+từ|từ)\b/i.test(text);
  const hasReceiverKeyword = /(?:^|\s+)(?:giao\s+(?:hàng\s+)?(?:đến|tới|ở|tại|sang|vào|về|cho)|gửi\s+(?:đến|cho|tới)|đến|tới|sang|vào|về|xuống|lên|ra)\b/i.test(text);

  if (!skipAddressExtraction) {
    if (tuMatch && tuMatch[1] && tuMatch[2]) {
      senderCandidate = cleanAddressText(tuMatch[1]);
      receiverCandidate = cleanAddressText(tuMatch[2]);
    } else if (layMatch && layMatch[1] && layMatch[2]) {
      senderCandidate = cleanAddressText(layMatch[1]);
      receiverCandidate = cleanAddressText(layMatch[2]);
    } else if (splitMatch && splitMatch.index !== undefined && splitMatch.index > 0) {
      const sPart = cleanAddressText(text.slice(0, splitMatch.index));
      const rPart = cleanAddressText(text.slice(splitMatch.index + splitMatch[0].length));

      const isCargo = !/(?:từ|ở|tại|phố|đường|quận|huyện|tỉnh|thành\s*phố|ngõ|ngách|số\s*\d+|\d+\s+[a-zA-ZÀ-ỹ])/i.test(sPart) &&
        (!!detectCargoCategory(sPart) || /\b\d+\s*(?:kg|kilo|g|gram)\b/i.test(sPart));
      const isDeliveryTime = !!detectDeliveryTime(rPart) || !!detectDeliveryTime(sPart);

      if (sPart.length >= 2 && !isCargo && !isDeliveryTime && !isNotValidAddress(sPart) && !isNotValidAddress(rPart)) {
        senderCandidate = sPart;
        receiverCandidate = rPart;
      }
    } else if (distinctLandmarks.length >= 2) {
      // Only split into sender & receiver if they are distinct and separated by routing keywords or punctuation
      const first = distinctLandmarks[0];
      const second = distinctLandmarks[1];
      const between = text.slice(first.matchIndex + first.matchLength, second.matchIndex);
      if (/(?:đến|tới|sang|vào|về|xuống|lên|ra|đi|giao|chuyển|-|–|,)/i.test(between) || (!hasSenderKeyword && !hasReceiverKeyword)) {
        senderCandidate = first.fullAddress;
        receiverCandidate = second.fullAddress;
      }
    }
  }

  if (senderCandidate || receiverCandidate) {
    if (senderCandidate && !isNotValidAddress(senderCandidate)) {
      const sResolved = reverseGeocodeAddress(senderCandidate);
      if (sResolved.address && !isGenericCargoWord(sResolved.address) && !isNotValidAddress(sResolved.address)) {
        const canUpdateSender = !updated.sender.address || isCorrection || (!updated.sender.hasWardCommune && sResolved.hasWardCommune) || Boolean(tuMatch || layMatch);
        if (canUpdateSender) {
          updated.sender.address = sResolved.address;
          updated.sender.hasWardCommune = sResolved.hasWardCommune;
        }
      }
    }
    if (receiverCandidate && !isNotValidAddress(receiverCandidate)) {
      const cleanReceiver = receiverCandidate.replace(/(?:,\s*|\s+)(?:kiện\s+hàng|thùng\s+hàng|hàng\s+là|nặng|khối\s+lượng|hỏa\s+tốc|trong\s+ngày|sáng\s+mai|chiều\s+nay|giao\s+ngay|\d+\s*kg).*/i, '').trim();
      if (!isNotValidAddress(cleanReceiver)) {
        const rResolved = reverseGeocodeAddress(cleanReceiver);
        if (rResolved.address && !isGenericCargoWord(rResolved.address) && !isNotValidAddress(rResolved.address)) {
          const canUpdateReceiver = !updated.receiver.address || isCorrection || (!updated.receiver.hasWardCommune && rResolved.hasWardCommune) || Boolean(tuMatch || layMatch);
          if (canUpdateReceiver) {
            updated.receiver.address = rResolved.address;
            updated.receiver.hasWardCommune = rResolved.hasWardCommune;
          }
        }
      }
    }
  } else if (!skipAddressExtraction) {
    // Single address mentioned in message
    let candidate = '';
    const addrMatch = text.match(/(?:ở|tại|lấy\s+(?:hàng\s+)?tại|lấy\s+(?:hàng\s+)?ở|địa chỉ|giao\s+(?:hàng\s+)?tại|giao\s+(?:hàng\s+)?đến|giao\s+(?:hàng\s+)?ở|giao\s+(?:hàng\s+)?tới|(?<!(?:chưa|dưới|khoảng|tầm)\s+)(?:đến|tới))\s+(?!\d+\s*(?:kg|kilo|kilogram|cân|g|gram|tấn)\b)([^,.\n]+)/i);
    if (addrMatch && addrMatch[1]) {
      const c = cleanAddressText(addrMatch[1]);
      if (!isNotValidAddress(c) && hasExplicitAddressSignal(c)) {
        candidate = c;
      }
    }

    if (!candidate && distinctLandmarks.length === 1) {
      candidate = distinctLandmarks[0].fullAddress;
    }

    if (!candidate) {
      const geoCheck = reverseGeocodeAddress(text);
      if (geoCheck.hasWardCommune && !isNotValidAddress(geoCheck.address)) {
        candidate = geoCheck.address;
      } else {
        const isAnsweringAddress = current?.nextMissingKey === 'sender_address' || current?.nextMissingKey === 'receiver_address';
        if (
          isAnsweringAddress &&
          !isValidVNPhone(text) &&
          !detectCargoCategory(text) &&
          !detectDeliveryTime(text) &&
          !isNotValidAddress(text) &&
          !isChatNoiseOrQuestion &&
          hasExplicitAddressSignal(text)
        ) {
          candidate = cleanAddressText(text);
        }
      }
    }

    if (candidate && !isGenericCargoWord(candidate) && !isNotValidAddress(candidate)) {
      const resolved = reverseGeocodeAddress(candidate);
      if (resolved.address && !isNotValidAddress(resolved.address)) {
        const assignSender = () => {
          if (!updated.sender.address || isCorrection || (!updated.sender.hasWardCommune && resolved.hasWardCommune)) {
            updated.sender.address = resolved.address;
            updated.sender.hasWardCommune = resolved.hasWardCommune;
          }
        };
        const assignReceiver = () => {
          if (!updated.receiver.address || isCorrection || (!updated.receiver.hasWardCommune && resolved.hasWardCommune)) {
            updated.receiver.address = resolved.address;
            updated.receiver.hasWardCommune = resolved.hasWardCommune;
          }
        };
        if (hasReceiverKeyword && !hasSenderKeyword) {
          assignReceiver();
        } else if (hasSenderKeyword && !hasReceiverKeyword) {
          assignSender();
        } else if (current?.nextMissingKey === 'receiver_address' && !updated.receiver.address) {
          assignReceiver();
        } else if (current?.nextMissingKey === 'sender_address' && !updated.sender.address) {
          assignSender();
        } else {
          if (!updated.sender.address || !updated.sender.hasWardCommune) {
            assignSender();
          } else if (!updated.receiver.address || !updated.receiver.hasWardCommune) {
            assignReceiver();
          }
        }
      }
    }
  }

  // 8. Detect Item Name / Category (Bắt buộc là tên loại hàng: Hoa quả, Tài liệu, Quần áo...)
  const canUpdateCargoName = !updated.cargo.name || isGenericCargoWord(updated.cargo.name) || isCorrection;
  const detectedCategory = detectCargoCategory(text);
  if (detectedCategory) {
    if (canUpdateCargoName) {
      updated.cargo.name = detectedCategory;
      updated.cargo.category = detectedCategory;
    }
  } else if (canUpdateCargoName) {
    // Only capture if user explicitly stated what the item is (e.g., "hàng là bánh chưng", "loại hàng là hồ sơ", "mặt hàng là tranh")
    const cargoNameMatch = text.match(/(?:loại\s+hàng|mặt\s+hàng|tên\s+hàng|hàng\s+là)\s*(?::|là)?\s*([a-zA-Z0-9À-ỹ\s]{2,30}?)(?=\s+(?:nặng|khối\s+lượng|kích\s+thước|sáng|chiều|\d+\s*kg|\d+\s*g|$))/i);
    if (cargoNameMatch && cargoNameMatch[1]) {
      const rawName = cargoNameMatch[1].trim();
      if (!isGenericCargoWord(rawName) && !isConversationalOrQuestion(rawName)) {
        const catFromName = detectCargoCategory(rawName);
        if (catFromName) {
          updated.cargo.name = catFromName;
          updated.cargo.category = catFromName;
          if (!updated.cargo.specialNotes) {
            updated.cargo.specialNotes = rawName;
          }
        } else {
          updated.cargo.name = rawName;
        }
      }
    } else if (current?.nextMissingKey === 'cargo_info' && !updated.cargo.name) {
      // Nếu bot vừa hỏi "loại hàng gì" và khách trả lời ngắn gọn (VD: "đèn", "tranh", "xe đạp")
      const candidateItem = text.replace(/^(?:là|gửi|chuyển|bên\s+mình\s+gửi|em\s+gửi|anh\s+gửi|chị\s+gửi)\s+/i, '').replace(/[.!?]+$/, '').trim();
      const wordCount = candidateItem.split(/\s+/).filter(Boolean).length;
      const isSkipPhrase = /^(?:ok|oke|không|chưa|chưa\s*biết|chào|alo|xin\s*chào|có|được|gì\s*cũng\s*được|\d+)$/i.test(candidateItem) ||
        isValidVNPhone(candidateItem) ||
        Boolean(detectDeliveryTime(candidateItem)) ||
        isConversationalOrQuestion(candidateItem) ||
        /\b\d+\s*(?:kg|kilo|cân|g|gram)\b/i.test(candidateItem) ||
        hasAnyAddressKeyword;
      if (candidateItem.length >= 2 && candidateItem.length <= 45 && wordCount <= 6 && !isGenericCargoWord(candidateItem) && !isSkipPhrase) {
        updated.cargo.name = candidateItem.charAt(0).toUpperCase() + candidateItem.slice(1);
      }
    }
  }

  // Double check: If cargo.name is generic like "hàng", "đồ", "kiện hàng", clear it!
  if (isGenericCargoWord(updated.cargo.name)) {
    updated.cargo.name = '';
  }

  // 9. Delivery Time (Thời gian giao nhận dạng text)
  const detectedTime = detectDeliveryTime(text);
  if (detectedTime) {
    updated.deliveryTime = detectedTime;
  }

  // 10. Special Notes
  if (text.toLowerCase().includes('dễ vỡ')) {
    updated.cargo.specialNotes = 'Hàng dễ vỡ, xin nhẹ tay';
  } else if (text.toLowerCase().includes('bảo quản mát') || text.toLowerCase().includes('đông lạnh')) {
    updated.cargo.specialNotes = 'Bảo quản mát / giao sớm';
  } else if (text.toLowerCase().includes('giờ hành chính')) {
    updated.cargo.specialNotes = 'Giao trong giờ hành chính';
    if (!updated.deliveryTime) updated.deliveryTime = 'Trong giờ hành chính';
  }

  return {
    ...updated,
    _invalidSenderPhone: false,
    _invalidReceiverPhone: false,
  };
}

export function getNextQuestionAndReplies(nextKey: string | undefined, cargoInfo?: any): {
  question: string;
  fieldLabel: string;
  quickReplies: string[];
} {
  switch (nextKey) {
    case 'sender_address': {
      const cName = cargoInfo?.name && !isGenericCargoWord(cargoInfo.name) ? cargoInfo.name : '';
      const cWeight = cargoInfo?.weight || (cargoInfo?.weightKg ? `${cargoInfo.weightKg}kg` : '');
      const cSnippet = cName && cWeight ? `kiện [${cName}] (${cWeight})` : cName ? `loại hàng [${cName}]` : cWeight ? `khối lượng (${cWeight})` : '';

      return {
        question: cSnippet
          ? `Dạ em đã ghi nhận ${cSnippet} rồi ạ. Em xin địa chỉ lấy hàng chi tiết đến phường/xã.`
          : 'Em xin địa chỉ lấy hàng chi tiết đến phường/xã.',
        fieldLabel: 'Địa chỉ lấy hàng cụ thể',
        quickReplies: [],
      };
    }
    case 'receiver_address':
      return {
        question: 'Em xin địa chỉ giao hàng chi tiết đến phường/xã.',
        fieldLabel: 'Địa chỉ giao hàng cụ thể',
        quickReplies: [],
      };
    case 'cargo_info': {
      const hasName = !!cargoInfo?.name?.trim();
      const hasWeight = !!cargoInfo?.weight?.trim() || !!cargoInfo?.weightKg;
      const hasDims =
        !!cargoInfo?.dimensions?.raw?.trim() ||
        (!!cargoInfo?.dimensions?.length && !!cargoInfo?.dimensions?.width && !!cargoInfo?.dimensions?.height);

      let question = 'Em xin thông tin hàng: Tên hàng, Khối lượng (kg), Kích thước (DxRxC cm).';
      if (hasName && !hasWeight && !hasDims) {
        question = `Dạ em đã ghi nhận loại hàng là ${cargoInfo.name}. Em xin thêm khối lượng (kg) hoặc kích thước (DxRxC cm) của hàng nhé ạ.`;
      } else if (hasWeight && !hasName && !hasDims) {
        question = 'Em xin thêm tên loại hàng hoặc kích thước (DxRxC cm) của hàng nhé ạ.';
      } else if (hasDims && !hasName && !hasWeight) {
        question = 'Em xin thêm tên loại hàng hoặc khối lượng (kg) của hàng nhé ạ.';
      }

      return {
        question,
        fieldLabel: 'Thông tin hàng (Cần ít nhất 2/3 trường: Tên hàng, Khối lượng, Kích thước)',
        quickReplies: [],
      };
    }
    case 'delivery_time':
      return {
        question: 'Em xin thời gian giao nhận hàng.',
        fieldLabel: 'Thời gian giao nhận',
        quickReplies: [],
      };
    default:
      return {
        question: 'Dạ đơn hàng đã đầy đủ thông tin, anh/chị xác nhận giúp em nhé ạ!',
        fieldLabel: 'Đã hoàn tất',
        quickReplies: [],
      };
  }
}

export function formatOrderConfirmationForm(info: any): string {
  const senderAddr = info.sender?.address?.trim() || 'Chưa có';
  const receiverAddr = info.receiver?.address?.trim() || 'Chưa có';

  const cargoParts: string[] = [];
  if (info.cargo?.name?.trim() && !isGenericCargoWord(info.cargo.name)) {
    cargoParts.push(info.cargo.name.trim());
  }
  if (info.cargo?.weight?.trim()) {
    cargoParts.push(info.cargo.weight.trim());
  } else if (info.cargo?.weightKg) {
    cargoParts.push(`${info.cargo.weightKg} kg`);
  }
  if (info.cargo?.dimensions?.raw?.trim()) {
    cargoParts.push(info.cargo.dimensions.raw.trim());
  } else if (info.cargo?.dimensions?.length && info.cargo?.dimensions?.width && info.cargo?.dimensions?.height) {
    cargoParts.push(`${info.cargo.dimensions.length}x${info.cargo.dimensions.width}x${info.cargo.dimensions.height} cm`);
  }
  const cargoStr = Array.isArray(info.cargo?.items)&&info.cargo.items.length ? `${info.cargo.items.map((i:any)=>`${i.name} (${i.weight})`).join('; ')} — tổng ${info.cargo.weightKg} kg${info.cargo.dimensions?.raw?', '+info.cargo.dimensions.raw:''}` : cargoParts.length > 0 ? cargoParts.join(', ') : 'Chưa có';
  const deliveryTimeStr = info.deliveryTime?.trim() || 'Chưa có';

  return `Dạ em đã nhận đủ thông tin đơn hàng, anh/chị xác nhận giúp em để em báo giá cho mình ạ:
1) Địa chỉ lấy hàng: ${senderAddr}
2) Địa chỉ giao hàng: ${receiverAddr}
3) Thông tin hàng: ${cargoStr}
4) Thời gian giao nhận: ${deliveryTimeStr}`;
}

export const ORDER_CONFIRMATION_CLOSING_PHRASE = 'Anh/ chị đợi chút em báo giá cho mình ạ';


export function formatOrderClosingWithBill(info: any): string {
  const code = info?.trackingCode || generateTrackingCode();
  const bill = generateShipmentTextSummary(info, code);
  return `${ORDER_CONFIRMATION_CLOSING_PHRASE}.\n\n${bill}`;
}

export function isCustomerConfirmation(text: string | undefined | null): boolean {
  if (!text) return false;
  const t = text.trim().toLowerCase();

  // 1. Nếu chứa từ ngữ phủ định, thắc mắc tại sao hoặc yêu cầu sửa đổi cụ thể -> KHÔNG phải là xác nhận
  if (
    /(?:không\s*(?:phải|đúng|chuẩn|chính\s*xác|được|đồng\s*ý)|sai\s*(?:rồi|địa\s*chỉ|thông\s*tin)?|nhầm|sửa|thay\s*đổi|chỉnh\s*lại|đổi\s*(?:lại|thành|sang)|sao\s*lại|tại\s*sao|chờ\s*(?:tí|chút|đã)|đợi\s*(?:tí|chút|đã))\b/i.test(t)
  ) {
    return false;
  }

  // 2. Nếu chứa số lượng cụ thể đi kèm thời gian hoặc khối lượng, có thể là trả lời thông tin
  if (/\b(?:đúng|chuẩn)\s+\d+\s*(?:h|giờ|g|am|pm|kg|cân|g|gam)\b/i.test(t)) {
    return false;
  }

  // 3. Nếu chứa từ khóa địa chỉ đường phố rõ ràng mà không đi kèm ý xác nhận/báo giá -> KHÔNG phải xác nhận
  const hasAddressWords = /(?:số\s+\d+|\bphố\b|\bđường\b|\bngõ\b|\bngách\b|\bphường\b|\bxã\b|\bquận\b|\bhuyện\b|\btỉnh\b|\btòa\b|\bchung\s+cư\b)/i.test(t);
  if (hasAddressWords && !/(?:xác\s*nhận|báo\s*giá|lên\s*đơn|chốt\s*đơn)/i.test(t)) {
    return false;
  }

  // 4. Nhóm YÊU CẦU BÁO GIÁ / TÍNH TIỀN (ví dụ: "báo giá giúp anh", "báo giá giúp chị", "em báo giá nhé", "tính tiền giúp mình", "cho xin báo giá", "check giá", "hết bao nhiêu tiền em", "cước phí thế nào")
  if (
    /\b(?:báo\s*giá|bao\s*gia|tính\s*giá|tinh\s*gia|tính\s*tiền|tinh\s*tien|tính\s*cước|tinh\s*cuoc|check\s*giá|xin\s*giá|cho\s*(?:anh|chị|em|mình|tôi|bác|chú)?\s*(?:xin\s*)?(?:báo\s*)?giá|xem\s*giá|giá\s*cả|cước\s*phí|bao\s*nhiêu\s*tiền|hết\s*bao\s*(?:nhiêu|tiền))\b/i.test(t)
  ) {
    return true;
  }

  // 5. Nhóm XÁC NHẬN / CONFIRM (ví dụ: "anh xác nhận nhé", "chị xác nhận nhé em", "mình xác nhận nhé", "xác nhận đơn này", "confirm em nhé", "anh confirm", "xác nhận giúp mình", "xác nhận nhé")
  if (/\b(?:xác\s*nhận|xac\s*nhan|confirm|xác\s*thực)\b/i.test(t)) {
    return true;
  }

  // 6. Nhóm ĐÚNG RỒI / CHUẨN RỒI / CHÍNH XÁC (ví dụ: "đúng rồi em", "chuẩn rồi em", "thông tin đúng rồi", "chuẩn luôn", "chính xác rồi", "đúng hết rồi", "chuẩn chỉ rồi", "đúng chuẩn rồi", "thấy đúng rồi")
  if (
    /\b(?:đúng|dung)\s*(?:rồi|roi|r|hết\s*rồi|đấy|đó|nha|nhé|nhe|em|ạ|a|chuẩn|thông\s*tin|cả\s*rồi|luôn)\b/i.test(t) ||
    /\b(?:chuẩn|chuan)\s*(?:rồi|roi|r|đấy|đó|nha|nhé|nhe|em|ạ|a|luôn|luon|chỉ|xác|quá)\b/i.test(t) ||
    /\b(?:chính\s*xác|chinh\s*xac)\b/i.test(t) ||
    /\b(?:thông\s*tin|thấy)\s*(?:đúng|chuẩn|chính\s*xác)\b/i.test(t)
  ) {
    return true;
  }

  // 7. Nhóm LÊN ĐƠN / CHỐT ĐƠN / TIẾN HÀNH (ví dụ: "lên đơn giúp anh nhé", "chốt đơn nhé em", "chốt nhé", "tiến hành đi em", "triển khai giúp anh")
  if (
    /\b(?:lên\s*đơn|len\s*don|chốt\s*đơn|chot\s*don|chốt\s*(?:nhé|luôn|đi|giúp|cho|em)|tiến\s*hành|triển\s*khai)\b/i.test(t)
  ) {
    return true;
  }

  // 8. Nhóm ĐỒNG Ý / NHẤT TRÍ / ĐƯỢC RỒI (ví dụ: "anh đồng ý nhé", "đồng ý em", "nhất trí nhé em", "được rồi em", "được em nhé", "ok nha")
  if (
    /\b(?:đồng\s*ý|dong\s*y|nhất\s*trí|nhat\s*tri)\b/i.test(t) ||
    /\b(?:được|duoc)\s*(?:rồi|roi|r|em|ạ|a|nha|nhé|nhe|luôn|đấy|đó)\b/i.test(t)
  ) {
    return true;
  }

  // 9. Nhóm OK / OKE / OKIE / YES (kể cả có đại từ: "anh ok nhé", "chị ok rồi em", "mình ok nhé", "ok em", "okie shop")
  if (
    /\b(?:ok|oke|okie|oki|okay|okey|yes|yep|yeah)\b/i.test(t)
  ) {
    return true;
  }

  // 10. Từ đơn ngắn gọn (k, ok, đúng, chuẩn, được, chuẩn rồi)
  if (/^(?:anh|chị|em|mình|tôi|dạ|vâng)?\s*(?:ok|oke|đúng|chuẩn|được)\b/i.test(t)) {
    return true;
  }

  return false;
}

export function normalizeForDedup(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countKeyAsksInHistory(history: any[] = []): Record<string, number> {
  const counts: Record<string, number> = {
    sender_address: 0,
    receiver_address: 0,
    cargo_info: 0,
    delivery_time: 0,
  };
  const botMsgs = (history || [])
    .filter((h: any) => h.role === 'model' || h.role === 'assistant' || h.sender === 'bot')
    .map((h: any) => String(h.content || h.text || '').toLowerCase());

  for (const msg of botMsgs) {
    if (/(?:địa chỉ lấy hàng|lấy hàng ở|chỗ lấy hàng|điểm lấy)/i.test(msg)) counts.sender_address += 1;
    else if (/(?:địa chỉ giao hàng|giao đến|giao hàng đến|điểm giao|gửi đến đâu)/i.test(msg)) counts.receiver_address += 1;
    else if (/(?:loại hàng gì|mặt hàng gì|tên mặt hàng|khối lượng|kích thước|nặng bao nhiêu|nặng tầm)/i.test(msg)) counts.cargo_info += 1;
    else if (/(?:thời gian giao nhận|khoảng thời gian nào|khi nào.*lấy|bao giờ.*giao)/i.test(msg)) counts.delivery_time += 1;
  }
  return counts;
}

export function chooseNextQuestionKey(evalResult: any, history: any[] = [], userText = ''): string | undefined {
  if (evalResult.isComplete) return undefined;
  const missing: string[] = evalResult.missingKeys || [];
  const defaultKey = evalResult.nextMissingKey;
  if (!defaultKey) return undefined;

  const counts = countKeyAsksInHistory(history);
  const noAddressYetInMsg = /(?:chưa\s*(?:có|biết|rõ)|để\s*hỏi\s*lại|từ\s*từ|chưa\s*chắc)/i.test(userText);

  if ((defaultKey === 'sender_address' || defaultKey === 'receiver_address') && (counts[defaultKey] >= 1 || noAddressYetInMsg)) {
    if (missing.includes('cargo_info') && counts.cargo_info < 2) {
      return 'cargo_info';
    }
    if (missing.includes('delivery_time') && counts.delivery_time < 2) {
      return 'delivery_time';
    }
    const otherAddr = defaultKey === 'sender_address' ? 'receiver_address' : 'sender_address';
    if (missing.includes(otherAddr) && counts[otherAddr] === 0) {
      return otherAddr;
    }
  }

  return defaultKey;
}

export function generateNaturalVietnameseReply(info: any, nextKey?: string, repeatCount = 0): string {
  const evalResult = evaluateCompleteness(info);
  if (evalResult.isComplete) {
    return formatOrderConfirmationForm(info);
  }

  const key = nextKey || evalResult.nextMissingKey;

  // Quy tắc: Đến lần thứ 2 hỏi cùng nội dung -> dùng thông điệp tự nhiên "Hiện em vẫn chưa có thông tin ..., vui lòng cung cấp để em tiếp tục tư vấn"
  if (repeatCount >= 1) {
    switch (key) {
      case 'sender_address':
        return 'Hiện em vẫn chưa có thông tin địa chỉ lấy hàng (kèm phường/xã), anh/chị vui lòng cung cấp để em tiếp tục tư vấn nhé.';
      case 'receiver_address':
        return 'Hiện em vẫn chưa có thông tin địa chỉ giao hàng (kèm phường/xã), anh/chị vui lòng cung cấp để em tiếp tục tư vấn nhé.';
      case 'cargo_info': {
        const cargo = info.cargo;
        const hasName = !!cargo?.name?.trim() && !isGenericCargoWord(cargo.name);
        const hasWeight = !!cargo?.weight?.trim() || !!cargo?.weightKg;
        if (hasWeight && !hasName) {
          return 'Hiện em vẫn chưa có thông tin tên mặt hàng mình cần gửi (ví dụ: đồ gia dụng, tài liệu, quần áo...), vui lòng cung cấp để em tiếp tục tư vấn ạ.';
        }
        if (hasName && !hasWeight) {
          return 'Hiện em vẫn chưa có thông tin khối lượng (kg) hoặc kích thước kiện hàng, vui lòng cung cấp để em tiếp tục tư vấn ạ.';
        }
        return 'Hiện em vẫn chưa có đủ thông tin hàng hóa (tên hàng kèm cân nặng hoặc kích thước), anh/chị vui lòng cung cấp để em tiếp tục tư vấn ạ.';
      }
      case 'delivery_time':
        return 'Hiện em vẫn chưa có thông tin thời gian giao nhận hàng, anh/chị vui lòng cung cấp để em tiếp tục tư vấn ạ.';
    }
  }

  const cargoName = info.cargo?.name && !isGenericCargoWord(info.cargo.name) ? info.cargo.name : '';
  const weightStr = info.cargo?.weight || (info.cargo?.weightKg ? `${info.cargo.weightKg}kg` : '');
  const cargoSnippet = cargoName && weightStr ? `kiện [${cargoName}] (${weightStr})` : cargoName ? `kiện [${cargoName}]` : weightStr ? `kiện hàng (${weightStr})` : '';

  switch (key) {
    case 'sender_address':
      if (cargoSnippet) {
        return `Dạ em đã ghi nhận ${cargoSnippet} rồi ạ. Anh/chị cho em xin địa chỉ lấy hàng (kèm phường/xã) để em kiểm tra tuyến nhé?`;
      }
      return 'Bên em chuyên về dịch vụ vận chuyển hỏa tốc, giao nhận tận nơi. Anh/chị cho em xin địa chỉ lấy hàng (kèm phường/xã) nhé?';

    case 'receiver_address': {
      const sAddr = info.sender?.address?.trim();
      if (sAddr && cargoSnippet) {
        return `Dạ em đã lưu điểm lấy hàng tại ${sAddr} và ${cargoSnippet} rồi ạ. Hàng này mình giao đến địa chỉ nào (kèm phường/xã) ạ?`;
      }
      if (sAddr) {
        return `Dạ em đã lưu điểm lấy hàng tại ${sAddr} rồi ạ. Mình cần giao hàng đến địa chỉ nào (kèm phường/xã) ạ?`;
      }
      if (cargoSnippet) {
        return `Dạ em đã ghi nhận ${cargoSnippet} rồi ạ. Anh/chị cần giao hàng đến địa chỉ nào (kèm phường/xã) ạ?`;
      }
      return 'Anh/chị cho em xin địa chỉ giao hàng cụ thể (kèm phường/xã) nhé?';
    }

    case 'cargo_info': {
      const cargo = info.cargo;
      const hasName = !!cargo?.name?.trim() && !isGenericCargoWord(cargo.name);
      const hasWeight = !!cargo?.weight?.trim() || !!cargo?.weightKg;
      const hasDims = !!cargo?.dimensions?.raw?.trim() || (!!cargo?.dimensions?.length && !!cargo?.dimensions?.width && !!cargo?.dimensions?.height);

      if (hasName && !hasWeight && !hasDims) {
        return `Dạ em đã lưu loại hàng là ${cargo.name} rồi ạ. Kiện này nặng khoảng bao nhiêu kg hoặc kích thước thế nào ạ?`;
      }
      if (hasWeight && !hasName && !hasDims) {
        const wStr = cargo.weight || `${cargo.weightKg} kg`;
        return `Dạ em đã lưu khối lượng ${wStr}. Kiện của mình là mặt hàng gì (ví dụ: tài liệu, hoa quả, quần áo, đồ gia dụng...) ạ?`;
      }
      if (hasDims && !hasName && !hasWeight) {
        return 'Dạ em đã lưu kích thước kiện hàng. Anh/chị cho em biết thêm tên mặt hàng hoặc khối lượng (kg) nhé?';
      }

      return 'Anh/chị gửi mặt hàng gì, nặng tầm bao nhiêu kg để bên em sắp xếp xe phù hợp ạ?';
    }

    case 'delivery_time': {
      const cName = info.cargo?.name && !isGenericCargoWord(info.cargo.name) ? `kiện [${info.cargo.name}]` : 'kiện hàng';
      return `Dạ em đã lưu thông tin ${cName} rồi ạ. Anh/chị cần bên em qua lấy và giao trong khoảng thời gian nào (như trong ngày hay sáng mai) ạ?`;
    }

    default:
      return 'Dạ em đã ghi nhận thông tin của anh/chị!';
  }
}

export function evaluateCompleteness(info: any, strictAddress = false) {
  const missingFields: string[] = [];
  const missingKeys: string[] = [];

  // 1. Địa chỉ lấy hàng (bắt buộc chi tiết đến phường/xã)
  const senderHasWard = info.sender?.addressReady ?? (info.sender?.hasWardCommune === true || (!strictAddress && checkHasWardCommune(info.sender?.address)));
  const hasSenderAddress = !!info.sender?.address?.trim() && senderHasWard;
  if (!hasSenderAddress) {
    missingKeys.push('sender_address');
    missingFields.push('Địa chỉ lấy hàng cụ thể');
  }

  // 2. Địa chỉ giao hàng (bắt buộc chi tiết đến phường/xã)
  const receiverHasWard = info.receiver?.addressReady ?? (info.receiver?.hasWardCommune === true || (!strictAddress && checkHasWardCommune(info.receiver?.address)));
  const hasReceiverAddress = !!info.receiver?.address?.trim() && receiverHasWard;
  if (!hasReceiverAddress) {
    missingKeys.push('receiver_address');
    missingFields.push('Địa chỉ giao hàng cụ thể');
  }

  // 3. Thông tin hàng: Tên hàng, Khối lượng (kg), Kích thước (DxRxC cm)
  // BẮT BUỘC: Phải nhận được 2 trên 3 trường thông tin mới pass. Nếu thiếu hỏi lại!
  const hasCargoName = !!info.cargo?.name?.trim() && !isGenericCargoWord(info.cargo.name);
  const hasCargoWeight = !!info.cargo?.weight?.trim() || !!info.cargo?.weightKg;
  const hasCargoDims =
    !!info.cargo?.dimensions?.raw?.trim() ||
    (!!info.cargo?.dimensions?.length && !!info.cargo?.dimensions?.width && !!info.cargo?.dimensions?.height);

  const cargoFieldsPresent = (hasCargoName ? 1 : 0) + (hasCargoWeight ? 1 : 0) + (hasCargoDims ? 1 : 0);

  if (cargoFieldsPresent < 2) {
    missingKeys.push('cargo_info');
    missingFields.push('Thông tin hàng: Cần ít nhất 2 trong 3 mục (Tên hàng, Khối lượng, Kích thước)');
  }

  // 4. Thời gian giao nhận (text) - từ "gấp" KHÔNG PHẢI là mốc thời gian giao nhận
  const rawDt = (info.deliveryTime || '').trim();
  const isInvalidGap = /^(?:gấp|cần\s*gấp|gửi\s*gấp|hàng\s*gấp|rất\s*gấp|đi\s*gấp|lấy\s*gấp|giao\s*gấp)$/i.test(rawDt);
  const hasDeliveryTime = !!rawDt && !isInvalidGap;
  if (!hasDeliveryTime) {
    missingKeys.push('delivery_time');
    missingFields.push('Thời gian giao nhận');
  }

  const totalMilestones = 4;
  const completedMilestones = totalMilestones - missingKeys.length;
  const rate = Math.round((completedMilestones / totalMilestones) * 100);
  const nextMissingKey = missingKeys[0];
  const nextPromptInfo = getNextQuestionAndReplies(nextMissingKey, info.cargo);

  return {
    missingFields,
    missingKeys,
    nextMissingKey,
    nextQuestion: nextPromptInfo.question,
    completionRate: rate,
    isComplete: missingKeys.length === 0,
  };
}
