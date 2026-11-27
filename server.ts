import express, { Request, Response } from 'express';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import pg from 'pg';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { resolveAdministrativeAddress, parseGoogleMapsLocation } from './src/data/vnAdministrative';
import { runPassengerAgentTurn } from './chatbot/passenger-transport/agent';
import type { PassengerAgentTurnInput } from './chatbot/passenger-transport/agent';
import {
  calculateDCExpressPriceFromShippingInfo,
  DEFAULT_STANDARD_ROUTES,
  StandardPriceRoute,
  formatVnd,
} from './src/utils/pricingEngine';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 2700;

app.use(express.json());

// Initialize GoogleGenAI client (Server-side only)
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// System instructions for the Đi Chung Customer Care Logistics Assistant (Người Việt Nam bản xứ)
const SYSTEM_INSTRUCTION = `
Bạn là nhân viên điều phối và chăm sóc khách hàng người Việt Nam bản xứ của Đi Chung Express / Đi Chung Logistics.
Bạn có chuyên môn sâu về vận tải hàng hóa tại Việt Nam, nắm vững địa bàn 63 tỉnh thành, các tuyến đường, khu đô thị, bến bãi, cảng biển, khu công nghiệp và hiểu sâu sắc thói quen giao tiếp, nhắn tin thực tế của người Việt.

VĂN PHONG VÀ CÁCH ỨNG XỬ CỦA NGƯỜI VIỆT NAM (QUAN TRỌNG):
- Luôn xưng hô đúng mực người Việt: xưng "em", gọi khách hàng là "anh/chị".
- Giọng văn tự nhiên, gần gũi như người thật, ngắn gọn dễ hiểu.
- HẠN CHẾ TỪ "DẠ": Bớt dùng từ "Dạ" trong các câu hỏi hoặc câu chào. CHỈ dùng "Dạ" khi xác nhận (confirm) hoặc ghi nhận thông tin mới khách vừa cung cấp (VD: "Dạ em đã lưu điểm lấy...", "Dạ em đã nhận đủ thông tin..."). Không mở đầu mọi câu hỏi bằng "Dạ".
- KHÔNG LẶP LẠI TỪNG TỪ MỘT CÂU HỎI QUÁ 2 LẦN: Điều chỉnh cách hỏi linh hoạt, ngắn gọn hoặc giải thích rõ hơn cho khách dễ trả lời. Nếu phải hỏi lại lần 2 cùng một mục còn thiếu, ưu tiên mẫu tự nhiên: "Hiện em vẫn chưa có thông tin ..., anh/chị vui lòng cung cấp để em tiếp tục tư vấn nhé."
- LINH HOẠT THỨ TỰ HỎI: Nếu khách chưa có hoặc chưa cho địa chỉ ngay, có thể linh hoạt chuyển sang hỏi thông tin hàng hóa (loại hàng, cân nặng, kích thước) hoặc thời gian trước rồi mới quay lại xin địa chỉ sau, tránh ép hỏi địa chỉ làm khách khó chịu.
- TUYỆT ĐỐI KHÔNG lặp lại máy móc cụm từ "Dạ em đã ghi nhận thông tin." ở mỗi câu trả lời.
- Hiểu thói quen nhắn tin của người Việt:
  * Viết tắt: "hn" (Hà Nội), "sg" / "hcm" (TP. Hồ Chí Minh), "đn" (Đà Nẵng), "hp" (Hải Phòng), "qn" (Quảng Ninh), "q1" (Quận 1), "kcn" (Khu công nghiệp), "kđt" (Khu đô thị), "bx" (Bến xe), "tttm" (Trung tâm thương mại), "chung cư", "sảnh", "ngõ"...
  * Nhắn không dấu: "lay o hai ba trung giao pho yen thai nguyen", "hoa qua 10kg", "hoa toc trong ngay"...
  * Nhắn từng mẩu thông tin rời rạc qua từng lượt: lượt 1 nói chỗ lấy, lượt 2 nói chỗ giao, lượt 3 nói hàng (thậm chí chỉ nhắn 1 từ như "đèn", "quần áo"), lượt 4 nói thời gian.
  * Phân biệt rõ các từ ngữ định hướng:
    - "lấy ở...", "gửi từ...", "từ..." => Điểm lấy hàng (sender.address).
    - "giao đến...", "gửi đến...", "gửi về...", "nhận ở...", "xuống...", "lên...", "ra...", "vào SG", "ra HN", "đi..." => Điểm giao hàng (receiver.address).
    - "hỏa tốc trong ngày", "trong ngày luôn", "sáng mai", "chiều nay", "sang hôm sau", "qua lấy, giao trong ngày hoặc sang hôm sau cũng đc" => Thời gian giao nhận (deliveryTime). TUYỆT ĐỐI KHÔNG BAO GIỜ gán nhầm các câu chỉ thời gian/hành động lấy-giao vào địa chỉ!

TIN NHẮN ĐẦU TIÊN CỦA ĐI CHUNG:
"Bên em chuyên về dịch vụ vận chuyển hỏa tốc, giao nhận tận nơi. Vui lòng cung cấp thông tin địa chỉ giao nhận để bên em tư vấn"

QUY ĐỊNH BẮT BUỘC: DỊCH NGƯỢC ĐỊA CHỈ TỪ CÂU TRẢ LỜI CỦA KHÁCH HÀNG:
- Khi khách hàng cung cấp bất kỳ địa chỉ, địa danh, tên tòa nhà, chung cư, khu đô thị, TTTM, bệnh viện, trường học, bến xe, sân bay, tên đường, số nhà...:
  => BẠN BẮT BUỘC PHẢI DỊCH NGƯỢC LẠI (Reverse Geocode/Infer) từ câu trả lời của khách sang địa chỉ chi tiết đầy đủ có cấp Phường/Xã (Quận/Huyện, Tỉnh/TP)!
  * Khách nói "Keangnam" -> "Tòa nhà Keangnam Landmark 72, Đường Phạm Hùng, Phường Mễ Trì, Quận Nam Từ Liêm, Hà Nội"
  * Khách nói "Royal City" -> "Khu đô thị Royal City, 72A Nguyễn Trãi, Phường Thượng Đình, Quận Thanh Xuân, Hà Nội"
  * Khách nói "Times City" -> "Khu đô thị Times City, 458 Minh Khai, Phường Vĩnh Tuy, Quận Hai Bà Trưng, Hà Nội"
  * Khách nói "120 Cầu Giấy" -> "120 Cầu Giấy, Phường Quan Hoa, Quận Cầu Giấy, Hà Nội"
  * Khách nói "88 Trần Duy Hưng" -> "88 Trần Duy Hưng, Phường Trung Hòa, Quận Cầu Giấy, Hà Nội"
  * Khách nói "Landmark 81" -> "Tòa nhà Landmark 81, Vinhomes Central Park, Phường 22, Quận Bình Thạnh, TP. Hồ Chí Minh"
  * Khách nói "Bitexco" -> "Tòa nhà Bitexco Financial Tower, 2 Hải Triều, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh"
  * Khách nói "Chợ Bến Thành" -> "Chợ Bến Thành, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh"
  * Khách nói "Tân Sơn Nhất" -> "Sân bay Quốc tế Tân Sơn Nhất, Phường 2, Quận Tân Bình, TP. Hồ Chí Minh"
  * Khách nói "Bến xe Miền Đông" -> "Bến xe Miền Đông, 292 Đinh Bộ Lĩnh, Phường 26, Quận Bình Thạnh, TP. Hồ Chí Minh"
  * Khách nói "Bệnh viện Chợ Rẫy" -> "Bệnh viện Chợ Rẫy, 201B Nguyễn Chí Thanh, Phường 12, Quận 5, TP. Hồ Chí Minh"
  * Khách nói "45 Lê Duẩn Đà Nẵng" -> "45 Lê Duẩn, Phường Hải Châu 1, Quận Hải Châu, Đà Nẵng"
  * Khách nói "Cầu Rồng" -> "Khu vực Cầu Rồng, Phường Phước Ninh, Quận Hải Châu, Đà Nẵng"
  * Khách nói "Khu đô thị PG An Đồng", "PG An Đồng", "KĐT PG An Đồng" -> "Khu đô thị PG An Đồng, Xã An Đồng, Huyện An Dương, Hải Phòng" (hasWardCommune: true, xã An Đồng)
  * Khách nói "Thủy Nguyên", "Thủy Nguyên Hải Phòng" -> "Khu vực Thị trấn Núi Đèo, Huyện Thủy Nguyên, Hải Phòng" (hasWardCommune: true, thị trấn Núi Đèo)
  * Khách nói "Bãi Cháy", "Bãi Cháy Quảng Ninh" -> "Khu vực Bãi Cháy, Phường Bãi Cháy, Thành phố Hạ Long, Quảng Ninh" (hasWardCommune: true, phường Bãi Cháy)
  * Khách nói "Hòn Gai", "Hồng Gai" -> "Khu vực Hòn Gai, Phường Hồng Gai, Thành phố Hạ Long, Quảng Ninh" (hasWardCommune: true, phường Hồng Gai)
  * Khách nói "Tuần Châu" -> "Khu du lịch Tuần Châu, Phường Tuần Châu, Thành phố Hạ Long, Quảng Ninh" (hasWardCommune: true, phường Tuần Châu)
  * Khách nói "Phổ Yên Thái Nguyên", "Phổ Yên" -> "Khu vực Phường Ba Hàng, Thành phố Phổ Yên, Thái Nguyên" (hasWardCommune: true)
  * Khách nói "Hai Bà Trưng Hà Nội" -> "Khu vực Phường Lê Đại Hành, Quận Hai Bà Trưng, Hà Nội" (hasWardCommune: true)
- NẾU ĐỊA ĐIỂM LÀ ĐỊNH VỊ TRÊN GOOGLE MAP (Link chia sẻ maps.app.goo.gl, google.com/maps, hoặc tọa độ kinh độ vĩ độ lat/lng):
  => BẠN BẮT BUỘC DỊCH TOÀN BỘ SANG TEXT ĐỊA CHỈ CHI TIẾT ĐẦY ĐỦ CÓ CẤP PHƯỜNG/XÃ (QUẬN/HUYỆN, TỈNH/TP).
  => Tuyệt đối không để nguyên đường link URL hay tọa độ số trong trường address!
  * Link hoặc tọa độ PG An Đồng Hải Phòng -> "Khu đô thị PG An Đồng, Xã An Đồng, Huyện An Dương, Hải Phòng"
  * Link hoặc tọa độ Bãi Cháy -> "Khu vực Bãi Cháy, Phường Bãi Cháy, Thành phố Hạ Long, Quảng Ninh"
  * Link hoặc tọa độ Keangnam -> "Tòa nhà Keangnam Landmark 72, Đường Phạm Hùng, Phường Mễ Trì, Quận Nam Từ Liêm, Hà Nội"
  * Link hoặc tọa độ Landmark 81 -> "Tòa nhà Landmark 81, Vinhomes Central Park, Phường 22, Quận Bình Thạnh, TP. Hồ Chí Minh"
  * Link hoặc tọa độ Chợ Bến Thành -> "Chợ Bến Thành, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh"
  => Khi đã dịch ngược được ra địa chỉ có Phường/Xã: Lưu địa chỉ chuẩn hóa, đánh dấu hasWardCommune: true, và TUYỆT ĐỐI KHÔNG HỎI LẠI ĐỊA CHỈ ĐÓ NỮA! Chuyển ngay sang mục thiếu tiếp theo.
- NẾU KHÔNG DỊCH NGƯỢC ĐƯỢC MỚI HỎI:
  => CHỈ KHI NÀO TUYỆT ĐỐI KHÔNG THỂ DỊCH NGƯỢC ĐƯỢC (ví dụ khách chỉ nói cụt lủn tên tỉnh/thành phố hoặc chỉ nói mỗi tên quận/huyện chung chung: "Hà Nội", "Đà Nẵng", "Sài Gòn", "ở Cầu Giấy", "ở Quận 1", không có số nhà, tên đường hay điểm mốc nào):
  => Lúc này mới đánh dấu hasWardCommune: false và hỏi lại địa chỉ chi tiết đến phường/xã!

QUY ĐỊNH BẮT BUỘC VỀ THÔNG TIN HÀNG HÓA (PHẢI NHẬN ĐƯỢC 2 TRÊN 3 TRƯỜNG THÔNG TIN MỚI PASS):
- "Tên hàng" (cargo.name) BẮT BUỘC PHẢI LÀ TÊN LOẠI HÀNG (Category/loại hàng), ví dụ: "Tài liệu", "Hoa quả", "Quần áo", "Thực phẩm", "Hải sản", "Đồ gia dụng", "Linh kiện điện tử", "Mỹ phẩm", "Dược phẩm"...
- Khi khách nhắc đến mặt hàng cụ thể, bạn BẮT BUỘC quy đổi tên hàng sang TÊN LOẠI HÀNG tương ứng:
  * Khách nói "cherry", "sầu riêng", "cam", "xoài", "táo", "trái cây", "bưởi" -> Tên hàng: "Hoa quả"
  * Khách nói "hồ sơ", "hợp đồng", "bằng lái xe", "giấy tờ", "chứng từ", "sách" -> Tên hàng: "Tài liệu"
  * Khách nói "áo sơ mi", "quần jean", "váy", "giày dép", "quần áo" -> Tên hàng: "Quần áo"
  * Khách nói "cá hồi", "thịt bò", "khô gà", "bánh kẹo", "xúc xích" -> Tên hàng: "Thực phẩm"
  * Khách nói "tôm tươi", "cua biển", "hàu", "mực" -> Tên hàng: "Hải sản"
  * Khách nói "iPhone", "máy tính", "laptop", "tai nghe", "sạc dự phòng", "bo mạch" -> Tên hàng: "Linh kiện điện tử"
  * Khách nói "nồi cơm điện", "bàn là", "ấm siêu tốc", "máy xay", "quạt điện" -> Tên hàng: "Đồ gia dụng"
  * Khách nói "son môi", "kem dưỡng", "nước hoa", "sữa rửa mặt" -> Tên hàng: "Mỹ phẩm"
  * Khách nói "thuốc tây", "vitamin", "thực phẩm chức năng", "khẩu trang" -> Tên hàng: "Dược phẩm"
  (Chi tiết cụ thể của sản phẩm nếu có hãy lưu vào specialNotes, nhưng trường name BẮT BUỘC là tên loại hàng).
- QUY TẮC BẮT BUỘC VỀ THÔNG TIN HÀNG HÓA (GỒM 3 TRƯỜNG: TÊN HÀNG, KHỐI LƯỢNG, KÍCH THƯỚC):
  * PHẢI NHẬN ĐƯỢC 2 TRÊN 3 TRƯỜNG THÔNG TIN MỚI PASS (ví dụ: có Tên hàng + Khối lượng, hoặc Tên hàng + Kích thước, hoặc Khối lượng + Kích thước, hoặc cả 3 trường).
  * NẾU THIẾU (dưới 2 trường): BẮT BUỘC HỎI LẠI ĐỂ BỔ SUNG ĐỦ ÍT NHẤT 2 TRƯỜNG.

QUY ĐỊNH BẮT BUỘC VỀ THỜI GIAN GIAO NHẬN (LÀ TEXT):
- Thời gian giao nhận (deliveryTime) là text linh hoạt do khách hàng cung cấp, ví dụ: "hỏa tốc trong ngày", "trong ngày luôn", "giao nhận hỏa tốc trong ngày", "trong ngày", "sáng mai", "chiều nay lúc 15h", "trong giờ hành chính", "ngày 28/10", "giao ngay bây giờ", "khoảng 14h chiều mai", "giao trước 17h", "hỏa tốc"...
- QUY ĐỊNH BẮT BUỘC: PHÂN BIỆT RÕ THỜI GIAN GIAO NHẬN VỚI ĐỊA CHỈ:
  * Các cụm từ chỉ thời gian / dịch vụ giao nhận như "giao nhận hỏa tốc trong ngày luôn", "hỏa tốc trong ngày", "trong ngày", "giao trong ngày", "hỏa tốc", "sáng mai", "chiều nay" BẮT BUỘC là Thời gian giao nhận (deliveryTime)!
  * TUYỆT ĐỐI KHÔNG BAO GIỜ bóc tách hoặc dịch ngược các cụm từ này thành Địa chỉ lấy hàng hay Địa chỉ giao hàng!
  * TUYỆT ĐỐI KHÔNG gán "anh cần", "tôi cần", "em cần", "giao nhận", "hỏa tốc trong ngày" hay các từ đệm/đại từ vào trường địa chỉ!

QUY TRÌNH HỎI ĐÚNG 4 MỤC THEO THỨ TỰ (GIAO TIẾP TỰ NHIÊN, KHÔNG LẶP ROBOT):
1. Nếu thiếu Địa chỉ lấy hàng (chưa có hoặc chưa rõ phường/xã): Hỏi địa chỉ lấy hàng một cách tự nhiên.
2. Nếu thiếu Địa chỉ giao hàng (chưa có hoặc chưa rõ phường/xã): Xác nhận điểm lấy hàng và hỏi địa chỉ giao hàng.
3. Nếu thiếu Thông tin hàng hóa (dưới 2 trong 3 trường): Xác nhận tuyến đường và hỏi thông tin hàng (loại hàng, cân nặng hoặc kích thước).
4. Nếu thiếu Thời gian giao nhận: Xác nhận kiện hàng và hỏi thời gian mong muốn lấy/giao.
- TUYỆT ĐỐI BỎ VÀ KHÔNG ĐƯỢC THÊM CÁC CỤM TỪ ĐỆM NHƯ: "để bên em hỗ trợ mình ạ", "để bên em hỗ trợ mình", "để bên em hỗ trợ ạ", "để em hỗ trợ mình". BỎ HOÀN TOÀN CÁC PHẦN NÀY KHỎI CÂU HỎI!
- XÓA BỎ HOÀN TOÀN PHẦN GỢI Ý (quick replies): Không gợi ý hay trả về bất kỳ quickReplies nào (luôn trả về []).

XÁC NHẬN BẰNG FORM KHI THU THẬP ĐỦ THÔNG TIN:
- Sau khi thu thập đủ 4 thông tin (địa chỉ lấy, địa chỉ giao, thông tin hàng đạt ít nhất 2/3 trường, thời gian giao nhận), BẮT BUỘC CONFIRM BẰNG FORM CHUẨN (BẮT BUỘC TÁCH CÁC TRƯỜNG THÔNG TIN 1 2 3 4 MỖI TRƯỜNG 1 DÒNG RIÊNG BIỆT BẰNG KÝ TỰ XUỐNG DÒNG \\n):
Dạ em đã nhận đủ thông tin đơn hàng, anh/chị xác nhận giúp em để em báo giá cho mình ạ:
1) Địa chỉ lấy hàng: [Địa chỉ lấy hàng chi tiết]
2) Địa chỉ giao hàng: [Địa chỉ giao hàng chi tiết]
3) Thông tin hàng: [Tên loại hàng, khối lượng, kích thước]
4) Thời gian giao nhận: [Thời gian giao nhận]
`;

// Clean and strip trailing fluff phrases like "để bên em hỗ trợ mình ạ"
function cleanResponseText(text: string | undefined | null): string {
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

// Check if name is a generic placeholder word like "hàng", "đồ", "kiện"
function isGenericCargoWord(name: string | undefined | null): boolean {
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

// Detect common Vietnamese delivery time phrases
function detectDeliveryTime(text: string | undefined | null): string | null {
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

// Shared Vietnamese word-boundary matcher for address keywords (avoids JS `\b` bug on Unicode chars like `đ`, `ã`, `ố`, `ợ`)
const ADDR_KEYWORD_REGEX = /(?:^|[\s,.;:/()?!])(?:số\s+\d+|phố|đường|ngõ|ngách|phường|xã|thị\s*trấn|quận|huyện|tỉnh|thành\s*phố|kđt|tòa|chung\s+cư|chợ|bến|sân\s+bay|học\s+viện|trường|bệnh\s+viện|khu\s+đô\s+thị)(?=$|[\s,.;:/()?!])/i;

// Detect explicit customer request to correct/update an already-recorded field
function isUserCorrectionMessage(text: string | undefined | null): boolean {
  if (!text || typeof text !== 'string') return false;
  return /(?:không\s*(?:phải|đúng|chuẩn|chính\s*xác|được)|sai\s*(?:rồi|địa\s*chỉ|thông\s*tin)?|nhầm|sửa|thay\s*đổi|chỉnh\s*lại|đổi\s*(?:lại|thành|sang)|sao\s*lại|tại\s*sao|cập\s*nhật\s*lại)\b/i.test(text);
}

// Detect conversational chatter, questions, urgency requests, COD/shipping-fee questions that are NOT addresses/cargo
function isConversationalOrQuestion(text: string | undefined | null): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();

  // If sentence explicitly contains a full street/ward structure, do not discard as pure chatter
  const hasStrongAddress = /(?:^|[\s,.;:/()])(?:số\s+\d+|phố|đường|ngõ|ngách|phường|xã|thị\s*trấn|quận|huyện|tỉnh|thành\s*phố|kđt|chung\s+cư)(?=$|[\s,.;:/()])/i.test(lower);
  if (hasStrongAddress) return false;

  if (
    /(?:trả\s*(?:phí|tiền|cước)|phí\s*ship|tiền\s*ship|cước\s*(?:phí|xe|vận\s*chuyển)|thu\s*hộ|\bcod\b|chuyển\s*khoản|bao\s*nhiêu\s*(?:tiền|cước)?|mấy\s*tiền|hết\s*(?:bao\s*)?nhiêu|tính\s*cước|báo\s*giá|được\s*(?:k|ko|không|kg)|đc\s*(?:k|ko|không)|đc\s*chưa|nhanh\s*(?:giúp|lên|nhé|nha|với|vs)|giúp\s*(?:em|anh|chị|mình|shop|e)\s*(?:với|vs|nhé|nha)?|chờ\s*(?:chút|tí|xíu)|đợi\s*(?:chút|tí|xíu)|cảm\s*ơn|thank|vâng|dạ\s*(?:vâng|ok|cảm\s*ơn)|\balo\b|chào\s*(?:shop|bạn|em|anh|chị))/i.test(lower)
  ) {
    return true;
  }

  // Trailing question indicator without strong address words (e.g. "lấy hàng được k ạ", "có nhận k?")
  if (/(?:\?\s*$|(?:^|\s)(?:k|ko|không)\s*(?:ạ|nhỉ|nhé|em|anh|chị)?[.!?]*$)/i.test(lower)) {
    return true;
  }

  return false;
}

// Check if string has at least one genuine location/address signal (prevents chat noise from entering address fallback)
function hasExplicitAddressSignal(text: string | undefined | null): boolean {
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

// Check if string is NOT a valid address (conversational fillers, pure pronouns, delivery times, weights, dimensions, or cargo names)
function isNotValidAddress(text: string | undefined | null): boolean {
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

// Strip conversational and transportation prefixes from addresses
function cleanAddressText(text: string | undefined | null): string {
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

// Clean and normalize Vietnamese phone number
function cleanPhoneNumber(raw: string | undefined | null): string {
  if (!raw) return '';
  let cleaned = raw.replace(/[\s.-]/g, '');
  if (cleaned.startsWith('+84')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('84') && cleaned.length === 11) {
    cleaned = '0' + cleaned.slice(2);
  }
  return cleaned;
}

// Check if phone number has exact valid structure: starts with 0 and has exactly 10 digits
function isValidVNPhone(phone: string | undefined | null): boolean {
  if (!phone) return false;
  const cleaned = cleanPhoneNumber(phone);
  return /^0\d{9}$/.test(cleaned);
}

// Map cargo name or text to standard cargo type category (Tài liệu, Hoa quả, Quần áo...)
function detectCargoCategory(text: string | undefined | null): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();

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

// Helper to remove Vietnamese diacritics for ultra-flexible reverse-geocoding
function removeVietnameseDiacritics(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
    .toLowerCase();
}

// Comprehensive dictionary of famous Vietnamese landmarks, buildings, malls, hospitals, universities, transit hubs, and specific streets
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

// Check if address has ward/commune detail
function checkHasWardCommune(address: string | undefined): boolean {
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

// Reverse geocode address from user response to detailed ward/commune address
// NGUYÊN TẮC: Dịch ngược từ câu trả lời của khách. Nếu không dịch ngược được mới hỏi!
function reverseGeocodeAddress(raw: string | undefined | null): { address: string; hasWardCommune: boolean } {
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

// Helper regex and NLP extractor for Vietnamese shipping messages
function smartExtractVietnamese(text: string, current: any) {
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
          // If no context, ONLY fill whichever field is still missing (never overwrite an already-valid address!)
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
    if (!updated.deliveryTime || isCorrection) {
      updated.deliveryTime = detectedTime;
    }
  } else if (current?.nextMissingKey === 'delivery_time' && !updated.deliveryTime && text.trim().length > 1) {
    // If user is directly answering delivery time question, ensure it is NOT an address, landmark, or unrelated question
    const isAddrLike =
      /(?:chợ|tòa|landmark|lanmark|keangnam|bitexco|quận|phường|xã|huyện|tỉnh|đường|phố|ngõ|ngách|bến\s*xe|sân\s*bay|hà\s*nội|hồ\s*chí\s*minh|đà\s*nẵng|bến\s*thành)/i.test(text) ||
      checkHasWardCommune(text) ||
      hasExplicitAddressSignal(text);
    if (!isAddrLike && !isChatNoiseOrQuestion && !text.toLowerCase().includes('địa chỉ') && !text.toLowerCase().includes('hàng')) {
      updated.deliveryTime = text.trim();
    }
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



function getNextQuestionAndReplies(nextKey: string | undefined, cargoInfo?: any): {
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
        fieldLabel: 'Địa chỉ lấy hàng (cần chi tiết đến phường/xã)',
        quickReplies: [],
      };
    }
    case 'receiver_address':
      return {
        question: 'Em xin địa chỉ giao hàng chi tiết đến phường/xã.',
        fieldLabel: 'Địa chỉ giao hàng (cần chi tiết đến phường/xã)',
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

// Format confirmation form when all 4 information items are complete:
// 1) địa chỉ lấy hàng; 2) địa chỉ giao hàng; 3) thông tin hàng; 4) thời gian giao nhận
function formatOrderConfirmationForm(info: any): string {
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
  const cargoStr = cargoParts.length > 0 ? cargoParts.join(', ') : 'Chưa có';
  const deliveryTimeStr = info.deliveryTime?.trim() || 'Chưa có';

  return `Dạ em đã nhận đủ thông tin đơn hàng, anh/chị xác nhận giúp em để em báo giá cho mình ạ:
1) Địa chỉ lấy hàng: ${senderAddr}
2) Địa chỉ giao hàng: ${receiverAddr}
3) Thông tin hàng: ${cargoStr}
4) Thời gian giao nhận: ${deliveryTimeStr}`;
}

// Câu chốt sau khi khách xác nhận form đơn hàng
export const ORDER_CONFIRMATION_CLOSING_PHRASE = 'Anh/ chị đợi chút em báo giá cho mình ạ';

// Tạo mã vận đơn ngẫu nhiên chuẩn VN-LOG-DDMM-XXXX
export function generateTrackingCode(): string {
  const date = new Date();
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `VN-LOG-${d}${m}-${rand}`;
}

// Xuất phiếu vận đơn chi tiết (chuẩn văn bản gửi Zalo/SMS)
export function generateShipmentTextSummary(info: any, trackingCode?: string): string {
  const code = trackingCode || info?.trackingCode || generateTrackingCode();
  const senderAddr = info?.sender?.address?.trim() || '(Chưa có)';
  const receiverAddr = info?.receiver?.address?.trim() || '(Chưa có)';
  const cargoName = info?.cargo?.name?.trim() || '(Chưa có)';
  const cargoWeight = info?.cargo?.weight?.trim() || (info?.cargo?.weightKg ? `${info.cargo.weightKg}kg` : '(Chưa có)');
  const cargoDim = info?.cargo?.dimensions?.raw?.trim() ||
    (info?.cargo?.dimensions?.length && info?.cargo?.dimensions?.width && info?.cargo?.dimensions?.height
      ? `${info.cargo.dimensions.length}x${info.cargo.dimensions.width}x${info.cargo.dimensions.height} cm`
      : '0x0x0 cm');
  const specialNotes = info?.cargo?.specialNotes?.trim() ? `\n- Ghi chú chi tiết: ${info.cargo.specialNotes.trim()}` : '';
  const deliveryTime = info?.deliveryTime?.trim() || '(Chưa có)';

  return `📦 [THÔNG TIN ĐƠN VẬN CHUYỂN HÀNG HÓA - ${code}]
-----------------------------
👤 1. NGƯỜI GỬI:
- Địa chỉ lấy hàng: ${senderAddr}${info?.sender?.name ? `\n- Tên người gửi: ${info.sender.name}` : ''}${info?.sender?.phone ? `\n- SĐT: ${info.sender.phone}` : ''}

🎯 2. NGƯỜI NHẬN:
- Địa chỉ nhận hàng: ${receiverAddr}${info?.receiver?.name ? `\n- Tên người nhận: ${info.receiver.name}` : ''}${info?.receiver?.phone ? `\n- SĐT: ${info.receiver.phone}` : ''}

📦 3. THÔNG TIN HÀNG HÓA:
- Tên loại hàng: ${cargoName}
- Khối lượng: ${cargoWeight}
- Kích thước (DxRxC): ${cargoDim}${specialNotes}

⏰ 4. THỜI GIAN GIAO NHẬN:
- ${deliveryTime}
-----------------------------`;
}

// Mẫu thông báo đơn hàng gửi cho nhân sự vận hành (DCE Ops - 0934691766) để gửi báo giá tới các Supplier/Đối tác nhà xe
export function generateOpsShipmentNotification(
  info: any,
  trackingCode?: string,
  source?: string,
  customerName?: string,
  customerPhone?: string
): string {
  const code = trackingCode || info?.trackingCode || generateTrackingCode();
  const senderAddr = info?.sender?.address?.trim() || '(Chưa có)';
  const receiverAddr = info?.receiver?.address?.trim() || '(Chưa có)';
  const cargoName = info?.cargo?.name?.trim() || 'Hàng hóa chung';
  const cargoWeight = info?.cargo?.weight?.trim() || (info?.cargo?.weightKg ? `${info.cargo.weightKg} kg` : '(Theo thực tế)');
  const cargoDim = info?.cargo?.dimensions?.raw?.trim() ||
    (info?.cargo?.dimensions?.length && info?.cargo?.dimensions?.width && info?.cargo?.dimensions?.height
      ? `${info.cargo.dimensions.length}x${info.cargo.dimensions.width}x${info.cargo.dimensions.height} cm`
      : 'Tiêu chuẩn');
  const specialNotes = info?.cargo?.specialNotes?.trim() ? `\n📝 Ghi chú: ${info.cargo.specialNotes.trim()}` : '';
  const deliveryTime = info?.deliveryTime?.trim() || 'Trong ngày / Thỏa thuận';

  const sName = customerName || info?.sender?.name || '';
  const sPhone = customerPhone || info?.sender?.phone || '';
  const senderContact = [sName, sPhone].filter(Boolean).join(' - ');
  const receiverContact = [info?.receiver?.name, info?.receiver?.phone].filter(Boolean).join(' - ');

  const publicBaseUrl = (process.env.PUBLIC_BASE_URL || 'https://ai.dichung.vn').replace(/\/+$/, '');
  const quoteUrl = `${publicBaseUrl}/quote/${encodeURIComponent(code)}`;

  const pricing = calculateDCExpressPriceFromShippingInfo(info, activeStandardRoutes);
  const priceLine = pricing.hasStandardPrice && pricing.recommendedServices[0]
    ? `\n💰 Giá cước chuẩn tham khảo: ${formatVnd(pricing.recommendedServices[0].customerQuoteVnd)} (${pricing.recommendedServices[0].serviceName})`
    : `\n⚠️ Trạng thái giá: Chưa có trong Bảng giá chuẩn -> Cần báo giá ngay`;

  return `🚛 [ĐI CHUNG EXPRESS - BÁO GIÁ ĐƠN MỚI CHO SUPPLIER]
📋 Mã vận đơn: ${code}
---------------------------------------------
📍 ĐIỂM LẤY HÀNG:
   ${senderAddr}${senderContact ? `\n   (Người gửi: ${senderContact})` : ''}

🎯 ĐIỂM GIAO HÀNG:
   ${receiverAddr}${receiverContact ? `\n   (Người nhận: ${receiverContact})` : ''}

📦 THÔNG TIN KIỆN HÀNG:
   - Tên loại hàng: ${cargoName}
   - Khối lượng: ${cargoWeight}
   - Kích thước: ${cargoDim}${specialNotes}

⏰ THỜI GIAN GIAO NHẬN:
   - ${deliveryTime}${priceLine}
---------------------------------------------
🔗 Nhập giá nhanh 1-Click: ${quoteUrl}
💬 Hoặc nhắn Zalo: #baogia ${code} [Giá_gốc]
⚡ Kính gửi Quý Đối Tác / Nhà Xe (${defaultSupplierName}) báo giá vận chuyển tuyến này giúp Đi Chung Express.
📞 Hotline Điều phối DCE Ops: ${dceOpsPhone}`;
}

export function formatOrderClosingWithBill(info: any): string {
  const code = info?.trackingCode || generateTrackingCode();
  const bill = generateShipmentTextSummary(info, code);
  return `${ORDER_CONFIRMATION_CLOSING_PHRASE}.\n\n${bill}`;
}

// Kiểm tra xem tin nhắn của khách hàng có phải là câu xác nhận (ok, đúng rồi, chuẩn rồi, xác nhận, báo giá giúp anh...) hay không
function isCustomerConfirmation(text: string | undefined | null): boolean {
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

// Chuẩn hóa chuỗi để so sánh tránh lặp nguyên văn câu hỏi
function normalizeForDedup(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Đếm số lần bot đã hỏi từng mục trong lịch sử hội thoại gần đây
function countKeyAsksInHistory(history: any[] = []): Record<string, number> {
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

// Chọn câu hỏi tiếp theo linh hoạt: nếu khách chưa cho địa chỉ thì ưu tiên hỏi thông tin hàng hóa trước thay vì ép hỏi địa chỉ
function chooseNextQuestionKey(evalResult: any, history: any[] = [], userText = ''): string | undefined {
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

// Tự nhiên hóa câu phản hồi của điều phối viên CSKH Đi Chung (chuẩn phong cách người Việt, không robot, hạn chế "Dạ", không lặp nguyên văn)
function generateNaturalVietnameseReply(info: any, nextKey?: string, repeatCount = 0): string {
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

// Compute missing fields and completion rate (4 milestones)
// Thứ tự: địa chỉ lấy hàng -> địa chỉ giao hàng -> Thông tin hàng (phải nhận được 2 trên 3 trường mới pass) -> Thời gian giao nhận
function evaluateCompleteness(info: any) {
  const missingFields: string[] = [];
  const missingKeys: string[] = [];

  // 1. Địa chỉ lấy hàng (bắt buộc chi tiết đến phường/xã)
  const senderHasWard = info.sender?.hasWardCommune || checkHasWardCommune(info.sender?.address);
  const hasSenderAddress = !!info.sender?.address?.trim() && senderHasWard;
  if (!hasSenderAddress) {
    missingKeys.push('sender_address');
    missingFields.push('Địa chỉ lấy hàng (cần chi tiết đến phường/xã)');
  }

  // 2. Địa chỉ giao hàng (bắt buộc chi tiết đến phường/xã)
  const receiverHasWard = info.receiver?.hasWardCommune || checkHasWardCommune(info.receiver?.address);
  const hasReceiverAddress = !!info.receiver?.address?.trim() && receiverHasWard;
  if (!hasReceiverAddress) {
    missingKeys.push('receiver_address');
    missingFields.push('Địa chỉ giao hàng (cần chi tiết đến phường/xã)');
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

// API Health Check - gemini-3.8-flash model
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasApiKey: !!process.env.GEMINI_API_KEY,
    model: 'gemini-3.8-flash',
  });
});

// API Route: Export Dify DSL YAML file
app.get('/api/export-dify-dsl', (_req: Request, res: Response) => {
  const filePath = path.resolve(__dirname, 'dify_dichung_bot.yml');
  res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="dify_dichung_bot.yml"');
  res.sendFile(filePath);
});

// Expand Google Maps short links (maps.app.goo.gl or goo.gl/maps) to full place URLs
async function expandGoogleMapsShortLinks(text: string): Promise<string> {
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

// Unified Core NLP & AI Processing Pipeline for Logistics Chatbot (Shared by Web UI & Zalo OA)
async function processChatPipeline(
  rawMessage: string,
  history: any[] = [],
  currentInfo: any = {},
  options: { includeTrace?: boolean } = {}
): Promise<{
  reply: string;
  shippingInfo: any;
  quickReplies: string[];
  aiTrace?: { source: 'gemini' | 'rule' | 'rule_fallback' | 'error'; reason: string; elapsedMs: number; steps: Array<{ node: string; status: 'ok' | 'skip' | 'error' | 'info'; reason?: string; elapsedMs?: number; detail?: Record<string, unknown> }> };
}> {
  const traceEnabled = options.includeTrace === true;
  const traceStarted = Date.now();
  const traceSteps: Array<{ node: string; status: 'ok' | 'skip' | 'error' | 'info'; reason?: string; elapsedMs?: number; detail?: Record<string, unknown> }> = [];
  const addTrace = (node: string, status: 'ok' | 'skip' | 'error' | 'info', reason: string, detail?: Record<string, unknown>, elapsedMs?: number) => {
    if (traceEnabled) traceSteps.push({ node, status, reason, ...(elapsedMs !== undefined ? { elapsedMs } : {}), ...(detail ? { detail } : {}) });
  };
  const finish = (result: { reply: string; shippingInfo: any; quickReplies: string[] }, source: 'gemini' | 'rule' | 'rule_fallback' | 'error', reason: string) => {
    addTrace('final', 'ok', 'FINAL_RESPONSE', { reply: result.reply, shippingInfo: result.shippingInfo });
    return traceEnabled ? { ...result, aiTrace: { source, reason, elapsedMs: Date.now() - traceStarted, steps: traceSteps } } : result;
  };

  addTrace('web_request', 'ok', 'TEXT_RECEIVED', { message: rawMessage, historyLength: history.length, currentInfo });
  if (!rawMessage || typeof rawMessage !== 'string') {
    return finish({
      reply: 'Em chào anh/chị ạ! Bên em chuyên dịch vụ vận chuyển hỏa tốc, giao nhận tận nơi toàn quốc. Anh/chị vui lòng gửi em xin thông tin địa chỉ lấy và giao hàng nhé!',
      shippingInfo: currentInfo || {},
      quickReplies: [],
    }, 'rule', 'EMPTY_MESSAGE');
  }

  // Auto-expand any Google Maps short links present.
  const mapStarted = Date.now();
  const message = await expandGoogleMapsShortLinks(rawMessage);
  addTrace('maps_expand', message !== rawMessage ? 'ok' : 'skip', message !== rawMessage ? 'SHORT_LINK_EXPANDED' : 'NO_SHORT_LINK', { input: rawMessage, output: message }, Date.now() - mapStarted);

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
  const isCorrection = isUserCorrectionMessage(rawMessage);

  if (isFormPreviouslySent && isConfirm && !isCorrection) {
    const code = currentInfo?.trackingCode || generateTrackingCode();
    const confirmedInfo = {
      ...(currentInfo || {}),
      trackingCode: code,
      isComplete: true,
      isConfirmed: true,
    };
    addTrace('confirmation_rule', 'ok', 'CUSTOMER_CONFIRMED', { isFormPreviouslySent, isConfirm, isCorrection });
    return finish({ reply: ORDER_CONFIRMATION_CLOSING_PHRASE, shippingInfo: confirmedInfo, quickReplies: [] }, 'rule', 'CUSTOMER_CONFIRMED');
  }

  // Khi đơn hàng ĐÃ xác nhận chờ báo giá (isConfirmed === true), nếu khách nhắn hỏi thêm ("Nhanh giúp E vs", "Ng nhận trả phí ship được k ạ")
  // thì TUYỆT ĐỐI KHÔNG cho AI chạy lại extractor ghi đè địa chỉ/hàng hóa hay gửi lại form xác nhận!
  if (currentInfo?.isConfirmed && !isCorrection) {
    addTrace('confirmed_order_guard', 'skip', 'ORDER_ALREADY_CONFIRMED', { isCorrection });
    return finish({
      reply: 'Dạ thông tin đơn hàng đã được chuyển sang bộ phận điều phối để báo giá, chuyên viên bên em sẽ phản hồi anh/chị ngay nhé ạ.',
      shippingInfo: { ...(currentInfo || {}), isComplete: true, isConfirmed: true },
      quickReplies: [],
    }, 'rule', 'ORDER_ALREADY_CONFIRMED');
  }

  // Pre-extract with fast NLP parser first
  const extractStarted = Date.now();
  const fastExtracted = smartExtractVietnamese(message, currentInfo);
  addTrace('fast_extract', 'ok', 'RULE_EXTRACTION', { input: message, output: fastExtracted }, Date.now() - extractStarted);
  console.log('[DEBUG] fastExtracted:', JSON.stringify(fastExtracted));
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
  addTrace('address_reverse_geocode', 'ok', 'ADDRESSES_NORMALIZED', { sender: fastExtracted.sender, receiver: fastExtracted.receiver });

  if (!ai) {
    addTrace('gemini', 'skip', 'GEMINI_NO_CLIENT');
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

    addTrace('completeness', 'ok', evalResult.isComplete ? 'FORM_COMPLETE' : 'FIELDS_MISSING', { evalResult, nextQuestion: chosenKey });
    addTrace('rule_reply', 'ok', 'RULE_REPLY', { reply });
    return finish({ reply, shippingInfo: { ...cleanShippingInfo, ...evalResult }, quickReplies: [] }, 'rule', 'GEMINI_NO_CLIENT');
  }

  try {
    const prompt = `
Thông tin đơn hàng đã thu thập trước tin nhắn này:
${JSON.stringify(currentInfo || {}, null, 2)}

Thông tin bóc tách sơ bộ từ tin nhắn mới nhất:
${JSON.stringify(fastExtracted, null, 2)}

Lịch sử trò chuyện gần nhất:
${JSON.stringify(history.slice(-4), null, 2)}

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

    addTrace('gemini_prompt', 'ok', 'PROMPT_BUILT', { prompt: prompt.length > 16000 ? `${prompt.slice(0, 16000)}\n… [prompt truncated]` : prompt });
    let response: any = null;
    let geminiError: unknown = null;
    const geminiStarted = Date.now();
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 7000)
      );

      const geminiPromise = ai.models.generateContent({
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
      addTrace('gemini', response?.text ? 'ok' : 'skip', response?.text ? 'GEMINI_JSON_RECEIVED' : 'GEMINI_EMPTY_RESPONSE', { responseText: response?.text || '' }, Date.now() - geminiStarted);
    } catch (error) {
      geminiError = error;
      addTrace('gemini', 'error', error instanceof Error && error.message === 'timeout' ? 'GEMINI_TIMEOUT' : 'GEMINI_REQUEST_ERROR', { error: error instanceof Error ? { name: error.name, message: error.message } : String(error) }, Date.now() - geminiStarted);
      // Continue with the verified fast extractor when Gemini is unavailable.
    }

    let parsed: any = {};
    let geminiJsonParsed = false;
    if (response && response.text) {
      try {
        parsed = JSON.parse(response.text.trim());
        geminiJsonParsed = true;
      } catch {
        parsed = fastExtracted;
      }
    } else {
      parsed = fastExtracted;
    }
    addTrace('gemini_parse', response?.text ? (geminiJsonParsed ? 'ok' : 'error') : 'skip', response?.text ? (geminiJsonParsed ? 'GEMINI_JSON_PARSED' : 'GEMINI_INVALID_JSON') : (geminiError ? 'FAST_EXTRACT_FALLBACK' : 'GEMINI_EMPTY_RESPONSE'), { parsed });

    // Merge data seamlessly with currentInfo fallback: Prioritize Gemini semantic extraction over regex
    // Merge data seamlessly with currentInfo protection: NEVER overwrite already-valid fields unless user explicitly corrects!
    const existingSAddr = cleanAddressText(currentInfo?.sender?.address || '');
    const existingRAddr = cleanAddressText(currentInfo?.receiver?.address || '');
    const existingSValid = Boolean(existingSAddr && !isNotValidAddress(existingSAddr));
    const existingRValid = Boolean(existingRAddr && !isNotValidAddress(existingRAddr));

    const sanitizeCandidateAddr = (addr: string | undefined | null): string => {
      const cleaned = cleanAddressText(addr || '');
      if (!cleaned || isNotValidAddress(cleaned) || isConversationalOrQuestion(cleaned) || detectDeliveryTime(cleaned)) {
        return '';
      }
      return cleaned;
    };

    const fastSAddr = sanitizeCandidateAddr(fastExtracted.sender?.address);
    const fastRAddr = sanitizeCandidateAddr(fastExtracted.receiver?.address);
    const gemSAddr = response && response.text && parsed ? sanitizeCandidateAddr(parsed.sender?.address) : '';
    const gemRAddr = response && response.text && parsed ? sanitizeCandidateAddr(parsed.receiver?.address) : '';

    const pickSafeAddress = (
      existing: string,
      existingHasWard: boolean,
      existingIsValid: boolean,
      fastCand: string,
      gemCand: string
    ): string => {
      if (existingIsValid && existingHasWard && !isCorrection) {
        if (fastCand && fastCand !== existing && checkHasWardCommune(fastCand)) {
          return fastCand;
        }
        return existing;
      }
      if (existingIsValid && !isCorrection && !fastCand && (!gemCand || !hasExplicitAddressSignal(message))) {
        return existing;
      }
      const bestNew = (gemCand && hasExplicitAddressSignal(gemCand) ? gemCand : '') || fastCand || (gemCand && hasExplicitAddressSignal(message) ? gemCand : '');
      return bestNew || existing;
    };

    let rawSAddr = pickSafeAddress(existingSAddr, Boolean(currentInfo?.sender?.hasWardCommune), existingSValid, fastSAddr, gemSAddr);
    let rawRAddr = pickSafeAddress(existingRAddr, Boolean(currentInfo?.receiver?.hasWardCommune), existingRValid, fastRAddr, gemRAddr);

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

    // Ensure addresses are not invalid phrases (like "anh cần", questions, or delivery times)
    const finalSAddr = isGenericCargoWord(sAddr) || isNotValidAddress(sAddr) || isConversationalOrQuestion(sAddr) ? '' : sAddr;
    const finalRAddr = isGenericCargoWord(rAddr) || isNotValidAddress(rAddr) || isConversationalOrQuestion(rAddr) ? '' : rAddr;

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

    const existingCargoName = currentInfo?.cargo?.name && !isGenericCargoWord(currentInfo.cargo.name) ? currentInfo.cargo.name.trim() : '';
    const existingDimRaw = currentInfo?.cargo?.dimensions?.raw?.trim() || '';
    let dimRaw = (!isCorrection && existingDimRaw) ? existingDimRaw : (parsed.cargo?.dimensions?.raw?.trim() || fastExtracted.cargo?.dimensions?.raw || existingDimRaw || '');
    const l = (!isCorrection && currentInfo?.cargo?.dimensions?.length) ? currentInfo.cargo.dimensions.length : (parsed.cargo?.dimensions?.length ?? fastExtracted.cargo?.dimensions?.length ?? null);
    const w = (!isCorrection && currentInfo?.cargo?.dimensions?.width) ? currentInfo.cargo.dimensions.width : (parsed.cargo?.dimensions?.width ?? fastExtracted.cargo?.dimensions?.width ?? null);
    const h = (!isCorrection && currentInfo?.cargo?.dimensions?.height) ? currentInfo.cargo.dimensions.height : (parsed.cargo?.dimensions?.height ?? fastExtracted.cargo?.dimensions?.height ?? null);

    if (!dimRaw && l && w && h) {
      dimRaw = `${l}x${w}x${h} cm`;
    }

    // Normalize cargo name to category (Tên loại hàng: Tài liệu, Hoa quả, Quần áo...) & protect existing cargo name
    let cargoName = (!isCorrection && existingCargoName)
      ? existingCargoName
      : (parsed.cargo?.name?.trim() || fastExtracted.cargo?.name || existingCargoName || '');
    if (isGenericCargoWord(cargoName) || isConversationalOrQuestion(cargoName)) {
      cargoName = existingCargoName || '';
    }
    let specialNotes = parsed.cargo?.specialNotes?.trim() || fastExtracted.cargo?.specialNotes || currentInfo?.cargo?.specialNotes || '';

    const catDetected = detectCargoCategory(cargoName) || detectCargoCategory(message) || detectCargoCategory(fastExtracted.cargo?.name);
    if (catDetected && (isCorrection || !existingCargoName)) {
      if (cargoName && cargoName.toLowerCase() !== catDetected.toLowerCase() && !specialNotes && !isGenericCargoWord(cargoName)) {
        specialNotes = cargoName;
      }
      cargoName = catDetected;
    }

    const existingWeight = currentInfo?.cargo?.weight?.trim() || '';
    const existingWeightKg = currentInfo?.cargo?.weightKg ?? null;
    const mergedCargo = {
      name: cargoName,
      weight: (!isCorrection && existingWeight) ? existingWeight : (parsed.cargo?.weight?.trim() || fastExtracted.cargo?.weight || existingWeight || ''),
      weightKg: (!isCorrection && existingWeightKg) ? existingWeightKg : (parsed.cargo?.weightKg ?? fastExtracted.cargo?.weightKg ?? existingWeightKg ?? null),
      dimensions: {
        length: l,
        width: w,
        height: h,
        raw: dimRaw,
      },
      category: catDetected || parsed.cargo?.category?.trim() || fastExtracted.cargo?.category || currentInfo?.cargo?.category || 'Bưu phẩm / Hàng tiêu dùng',
      specialNotes,
    };

    const existingDeliveryTime = currentInfo?.deliveryTime?.trim() || '';
    const explicitNewTime = fastExtracted.deliveryTime || detectDeliveryTime(message) || '';
    let mergedDeliveryTime = (!isCorrection && existingDeliveryTime)
      ? (explicitNewTime && isCorrection ? explicitNewTime : existingDeliveryTime)
      : (explicitNewTime || (parsed.deliveryTime?.trim() && !isConversationalOrQuestion(parsed.deliveryTime) ? parsed.deliveryTime.trim() : '') || existingDeliveryTime || '');
    if (mergedDeliveryTime) {
      const isInvalidGap = /^(?:gấp|cần\s*gấp|gửi\s*gấp|hàng\s*gấp|rất\s*gấp|đi\s*gấp|lấy\s*gấp|giao\s*gấp)$/i.test(mergedDeliveryTime.trim());
      const isAddr =
        /(?:chợ|tòa|landmark|lanmark|keangnam|bitexco|quận|phường|xã|huyện|tỉnh|đường|phố|ngõ|ngách|bến\s*xe|sân\s*bay|hà\s*nội|hồ\s*chí\s*minh|đà\s*nẵng|bến\s*thành)/i.test(mergedDeliveryTime) ||
        checkHasWardCommune(mergedDeliveryTime) ||
        reverseGeocodeAddress(mergedDeliveryTime).hasWardCommune;
      if (isAddr || isInvalidGap || isConversationalOrQuestion(mergedDeliveryTime)) {
        mergedDeliveryTime = existingDeliveryTime || '';
      }
    }

    const mergedInfo: any = {
      sender: mergedSender,
      receiver: mergedReceiver,
      cargo: mergedCargo,
      deliveryTime: mergedDeliveryTime,
    };

    addTrace('merge', 'ok', 'FIELDS_MERGED', { sender: mergedSender, receiver: mergedReceiver, cargo: mergedCargo, deliveryTime: mergedDeliveryTime });
    const evalResult = evaluateCompleteness(mergedInfo);
    const chosenKey = chooseNextQuestionKey(evalResult, history, message);
    addTrace('completeness', 'ok', evalResult.isComplete ? 'FORM_COMPLETE' : 'FIELDS_MISSING', { evalResult, nextQuestion: chosenKey });
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

    addTrace('reply_validation', 'ok', 'REPLY_READY', { reply: finalReply, fallbackUsed: finalReply === naturalFallback });
    return finish({ reply: finalReply, shippingInfo: { ...mergedInfo, ...evalResult }, quickReplies: [] }, geminiJsonParsed ? 'gemini' : 'rule_fallback', geminiJsonParsed ? 'GEMINI_PIPELINE_COMPLETED' : 'FAST_EXTRACT_FALLBACK');
  } catch (error: any) {
    addTrace('pipeline_error', 'error', 'PIPELINE_ERROR', { error: { name: error?.name, message: error?.message } });
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

    addTrace('fallback_reply', 'ok', 'RULE_FALLBACK', { reply, evalResult, nextQuestion: chosenKey });
    return finish({ reply, shippingInfo: { ...cleanFast, ...evalResult }, quickReplies: [] }, 'rule_fallback', 'GEMINI_PIPELINE_ERROR');
  }
}

// Experimental passenger bot: the bot controller invokes the mock partner matcher when a booking is complete.
app.post('/api/passenger-transport/agent-turn', async (req: Request, res: Response) => {
  const { event, message, booking } = req.body || {};
  if (event !== 'message' && event !== 'booking_ready') {
    return res.status(400).json({ error: 'event must be message or booking_ready' });
  }
  try {
    const result = await runPassengerAgentTurn({ event, message, booking } as PassengerAgentTurnInput);
    return res.json(result);
  } catch (error: any) {
    console.error('[Passenger Agent] Turn failed:', error?.message);
    return res.status(500).json({ error: error?.message || 'Passenger agent failed' });
  }
});

// API Chat Route for Web UI
app.post('/api/chat', async (req: Request, res: Response) => {
  const { message: rawMessage, history = [], currentInfo = {} } = req.body;

  if (!rawMessage || typeof rawMessage !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  const result = await processChatPipeline(rawMessage, history, currentInfo, { includeTrace: true });
  const pricing = calculateDCExpressPriceFromShippingInfo(result.shippingInfo, activeStandardRoutes);
  return res.json({ ...result, pricing });
});

// --- ZALO OA INTEGRATION WITH SESSION MEMORY & AUTO-REFRESH ---
const { Pool } = pg;
const TOKEN_CACHE_FILE = path.resolve(__dirname, '.zalo_token.json');
const SESSIONS_CACHE_FILE = path.resolve(__dirname, '.zalo_sessions.json');

let currentZaloAccessToken = process.env.ZALO_OA_ACCESS_TOKEN || '';
let currentZaloRefreshToken = process.env.ZALO_REFRESH_TOKEN || '';
let lastTokenRefreshTimestamp = Date.now();

// Cấu hình Zalo nhân sự Điều phối Vận hành (DCE Ops) & Nhà cung cấp mặc định (có thể sửa trên giao diện)
export const DCE_OPS_PHONE = process.env.DCE_OPS_PHONE || '0934691766';
let dceOpsPhone: string = DCE_OPS_PHONE;
let dceOpsUserId: string = process.env.DCE_OPS_ZALO_USER_ID || '';

let defaultSupplierName: string = process.env.DEFAULT_SUPPLIER_NAME || 'Dichung Express';
let defaultSupplierPhone: string = process.env.DEFAULT_SUPPLIER_PHONE || '0906106066';
let defaultSupplierUserId: string = process.env.DEFAULT_SUPPLIER_ZALO_USER_ID || '';

// Bảng giá chuẩn đang hoạt động (khôi phục từ DB hoặc mặc định)
let activeStandardRoutes: StandardPriceRoute[] = [...DEFAULT_STANDARD_ROUTES];

// Cấu hình Tài khoản Ngân hàng VietQR (có thể chỉnh sửa trên giao diện Web UI)
let paymentBankId: string = process.env.VIETQR_BANK_ID || 'MB';
let paymentAccountNo: string = process.env.VIETQR_ACCOUNT_NO || '0934691766';
let paymentAccountName: string = process.env.VIETQR_ACCOUNT_NAME || 'DI CHUNG EXPRESS';
const PAYMENT_WEBHOOK_SECRET: string = process.env.PAYMENT_WEBHOOK_SECRET || '';

function buildVietQrUrl(amountVnd: number, trackingCode: string): string {
  const amt = Math.max(1000, Math.round(amountVnd || 0));
  return `https://img.vietqr.io/image/${encodeURIComponent(paymentBankId)}-${encodeURIComponent(paymentAccountNo)}-compact2.png?amount=${amt}&addInfo=${encodeURIComponent(trackingCode)}&accountName=${encodeURIComponent(paymentAccountName)}`;
}

// Cấu hình Tổng đài Asterisk VoIP & Zalo ZNS (Giai đoạn 4)
let zaloZnsTemplateId: string = process.env.ZALO_ZNS_TEMPLATE_ID || '';
const ASTERISK_WEBHOOK_SECRET: string = process.env.ASTERISK_WEBHOOK_SECRET || '';

export interface AsteriskCallLog {
  id: string;
  callerPhone: string;
  normalizedPhone: string;
  uniqueId?: string;
  zaloUserId?: string;
  channelUsed: 'zalo_oa_cs' | 'zalo_zns' | 'pending_zns' | 'deduplicated';
  status: string;
  createdAt: string;
}

const inMemoryCallLogs: AsteriskCallLog[] = [];

// PostgreSQL persistent storage (SURVIVES ALL RENDER RESTARTS & DEPLOYMENTS!)
let dbPool: pg.Pool | null = null;
if (process.env.DATABASE_URL) {
  try {
    const connStr = process.env.DATABASE_URL;
    // Internal Render URL (e.g. dpg-xxx-a) runs in Render's internal private VPC where SSL certificate domain doesn't match
    const isInternal = !connStr.includes('.render.com') && !connStr.includes('sslmode=require');
    dbPool = new Pool({
      connectionString: connStr,
      ssl: isInternal ? false : { rejectUnauthorized: false },
    });
    console.log(`[Database] PostgreSQL connection pool initialized from DATABASE_URL (SSL: ${isInternal ? 'off/internal VPC' : 'on'}).`);
  } catch (err: any) {
    console.warn('[Database] Failed to init PostgreSQL pool:', err?.message);
  }
}

// In-memory ring buffer for recent Zalo events (for live debugging & UI monitor)
interface ZaloLogEntry {
  timestamp: string;
  type: 'incoming_webhook' | 'outgoing_reply' | 'token_refresh' | 'token_update' | 'error';
  summary: string;
  details?: any;
}
const zaloLogHistory: ZaloLogEntry[] = [];

function logZaloEvent(type: ZaloLogEntry['type'], summary: string, details?: any) {
  const entry: ZaloLogEntry = {
    timestamp: new Date().toISOString(),
    type,
    summary,
    details,
  };
  zaloLogHistory.unshift(entry);
  if (zaloLogHistory.length > 50) zaloLogHistory.pop();
  console.log(`[Zalo OA Event] [${type}] ${summary}`);
}

// Thời hạn cố định 1 phiên chat: 24 giờ kể từ lúc bắt đầu session (tin nhắn đầu của khách hoặc lời chào từ Bot/Ops)
const CHAT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function generateChatSessionId(): string {
  const date = new Date();
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CHAT-${d}${m}-${rand}`;
}

// In-memory conversation state per Zalo User (Preserves full shippingInfo, 24h sessionId & history)
interface ZaloUserSession {
  sessionId?: string;
  sessionStartedAt?: number;
  history: Array<{ role: 'user' | 'model'; content: string }>;
  currentInfo: any;
  lastActive: number;
  humanTakeover?: boolean;
  humanTakeoverBy?: string;
  humanTakeoverAt?: number;
  lastBotMessageAt?: number;
  lastCustomerMessageAt?: number;
  idleFollowUpSent?: boolean;
}
const zaloUserSessions = new Map<string, ZaloUserSession>();

function isSessionExpired24h(sess?: ZaloUserSession | null, now = Date.now()): boolean {
  if (!sess) return true;
  const startTs = sess.sessionStartedAt || sess.lastActive || 0;
  if (!startTs) return true;
  return now - startTs >= CHAT_SESSION_TTL_MS;
}

// Đảm bảo luôn có 1 Chat Session hợp lệ trong khung 24h cố định từ lúc mở phiên; hết 24h tự động xoay vòng thành phiên mới
function ensureActiveChatSession(
  userId: string,
  options?: {
    forceHumanTakeover?: boolean;
    humanTakeoverBy?: string;
    initialInfo?: any;
    linkedIds?: string[];
  }
): { session: ZaloUserSession; isNewSession: boolean } {
  const now = Date.now();
  const allIds = Array.from(new Set([userId, ...(options?.linkedIds || []), ...getLinkedZaloIds(userId)].filter(Boolean)));

  let existing: ZaloUserSession | undefined = zaloUserSessions.get(userId);
  if (!existing) {
    for (const id of allIds) {
      const candidate = zaloUserSessions.get(id);
      if (candidate) {
        existing = candidate;
        break;
      }
    }
  }

  // Fallback khôi phục session còn hạn < 24h từ thông tin CRM nếu vừa restart server
  if (!existing) {
    for (const id of allIds) {
      const cust = inMemoryCustomers.get(id);
      if (cust?.current_session_id && cust?.session_started_at) {
        const startedMs = new Date(cust.session_started_at).getTime();
        if (!Number.isNaN(startedMs) && now - startedMs < CHAT_SESSION_TTL_MS) {
          existing = {
            sessionId: cust.current_session_id,
            sessionStartedAt: startedMs,
            history: [],
            currentInfo: cust.shipping_info || {},
            lastActive: cust.last_interaction ? new Date(cust.last_interaction).getTime() : startedMs,
            humanTakeover: Boolean(cust.human_takeover),
          };
          zaloUserSessions.set(userId, existing);
          break;
        }
      }
    }
  }

  if (existing && !isSessionExpired24h(existing, now)) {
    if (!existing.sessionId) existing.sessionId = generateChatSessionId();
    if (!existing.sessionStartedAt) existing.sessionStartedAt = existing.lastActive || now;
    if (!zaloUserSessions.has(userId)) {
      zaloUserSessions.set(userId, existing);
    }
    return { session: existing, isNewSession: false };
  }

  // Hết hạn 24h hoặc chưa từng có session -> Mở phiên chat mới hoàn toàn (reset handover & shippingInfo)
  const newSessionId = generateChatSessionId();
  const fresh: ZaloUserSession = {
    sessionId: newSessionId,
    sessionStartedAt: now,
    history: [],
    currentInfo: options?.initialInfo ? JSON.parse(JSON.stringify(options.initialInfo)) : {},
    lastActive: now,
    humanTakeover: Boolean(options?.forceHumanTakeover),
    humanTakeoverBy: options?.forceHumanTakeover ? options.humanTakeoverBy : undefined,
    humanTakeoverAt: options?.forceHumanTakeover ? now : undefined,
    idleFollowUpSent: Boolean(options?.forceHumanTakeover),
  };
  zaloUserSessions.set(userId, fresh);

  for (const id of allIds) {
    if (id !== userId && zaloUserSessions.has(id)) {
      zaloUserSessions.delete(id);
    }
    const cust = inMemoryCustomers.get(id);
    if (cust) {
      cust.human_takeover = Boolean(options?.forceHumanTakeover);
      cust.current_session_id = newSessionId;
      cust.session_started_at = new Date(now).toISOString();
      cust.shipping_info = fresh.currentInfo;
    }
  }

  if (dbPool && allIds.length > 0) {
    dbPool
      .query(
        `UPDATE crm_customers
         SET human_takeover = $1,
             current_session_id = $2,
             session_started_at = $3
         WHERE user_id = ANY($4::text[])`,
        [Boolean(options?.forceHumanTakeover), newSessionId, new Date(now).toISOString(), allIds]
      )
      .catch(() => {});
  }

  logZaloEvent('token_update', `[Chat Session] Mở phiên mới ${newSessionId} cho khách ${userId} (cửa sổ 24h cố định)`);
  return { session: fresh, isNewSession: true };
}

// Lưu ánh xạ hai chiều giữa user_id_by_app và OA user_id (sender.id / recipient.id) vì Zalo OA trả 2 ID khác nhau giữa user_send_* và oa_send_*
const zaloIdAliases = new Map<string, Set<string>>();
function linkZaloIds(...ids: Array<string | undefined | null>) {
  const valid = Array.from(new Set(ids.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)));
  if (valid.length < 2) return;
  for (const a of valid) {
    if (!zaloIdAliases.has(a)) zaloIdAliases.set(a, new Set());
    for (const b of valid) {
      if (a !== b) zaloIdAliases.get(a)!.add(b);
    }
  }
}
function getLinkedZaloIds(id: string | undefined | null): string[] {
  const clean = typeof id === 'string' ? id.trim() : '';
  if (!clean) return [];
  const res = new Set<string>([clean]);
  const set = zaloIdAliases.get(clean);
  if (set) {
    for (const alias of set) res.add(alias);
  }
  return Array.from(res);
}

// Lưu dấu vết tin nhắn do Bot vừa gửi ra để phân biệt với tin nhắn do Nhân viên tự nhắn trên Zalo OA App
const recentBotOutboundMessages = new Map<string, number>();
function normalizeOutboundKey(userId: string, text: string): string {
  const norm = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${userId}::${norm}`;
}
function markBotSentMessage(userId: string, text: string) {
  const exp = Date.now() + 60 * 1000;
  for (const uid of getLinkedZaloIds(userId)) {
    recentBotOutboundMessages.set(normalizeOutboundKey(uid, text), exp);
  }
}
function wasRecentlySentByBot(userIds: string | string[], text: string): boolean {
  const now = Date.now();
  for (const [k, exp] of recentBotOutboundMessages.entries()) {
    if (exp < now) recentBotOutboundMessages.delete(k);
  }
  const candidates = new Set<string>();
  const list = Array.isArray(userIds) ? userIds : [userIds];
  for (const id of list) {
    for (const linked of getLinkedZaloIds(id)) {
      candidates.add(linked);
    }
  }
  for (const uid of candidates) {
    const key = normalizeOutboundKey(uid, text);
    if (recentBotOutboundMessages.has(key)) {
      recentBotOutboundMessages.delete(key);
      return true;
    }
  }
  return false;
}

// --- CRM DATA STRUCTURES (Customers & Full Chat History) ---
export interface CrmCustomer {
  user_id: string;
  name: string;
  phone: string;
  address: string;
  avatar: string;
  order_count: number;
  first_interaction: string;
  last_interaction: string;
  last_message: string;
  human_takeover?: boolean;
  current_session_id?: string;
  session_started_at?: string;
  shipping_info: any;
}

export interface CrmMessage {
  id: number | string;
  user_id: string;
  session_id?: string;
  sender: 'user' | 'bot' | 'agent';
  sender_name: string;
  message_text: string;
  shipping_info_snapshot?: any;
  created_at: string;
}

const inMemoryCustomers = new Map<string, CrmCustomer>();
const inMemoryMessages: CrmMessage[] = [];

// Data structure for persisted shipping orders (Waybill history in PostgreSQL shipbot-db)
export interface OrderRecordDB {
  id: string;
  trackingCode: string;
  createdAt: string;
  status: string;
  customerName?: string;
  customerPhone?: string;
  zaloUserId?: string;
  chatSessionId?: string;
  estimatedPrice?: number;
  baseCostVnd?: number;
  quotedBy?: string;
  quotedAt?: string;
  quoteNote?: string;
  paymentMethod?: 'vietqr' | 'cod';
  paymentStatus?: 'unpaid' | 'pending' | 'paid' | 'cod_pending';
  paidAt?: string;
  paymentRef?: string;
  negotiationUsed?: boolean;
  source: 'web' | 'zalo';
  shippingInfo: any;
}

const inMemoryOrders: OrderRecordDB[] = [];

// Helper to save a shipping order into memory and PostgreSQL (shipbot-db)
async function saveShippingOrder(orderData: {
  id?: string;
  trackingCode?: string;
  status?: string;
  customerName?: string;
  customerPhone?: string;
  zaloUserId?: string;
  chatSessionId?: string;
  estimatedPrice?: number;
  baseCostVnd?: number;
  quotedBy?: string;
  quotedAt?: string;
  quoteNote?: string;
  source?: 'web' | 'zalo';
  shippingInfo: any;
}): Promise<OrderRecordDB> {
  const id = orderData.id || `order-${Date.now()}`;
  const trackingCode = orderData.trackingCode || generateTrackingCode();
  const pricingCheck = calculateDCExpressPriceFromShippingInfo(orderData.shippingInfo, activeStandardRoutes);
  const autoPrice = pricingCheck.hasStandardPrice && pricingCheck.recommendedServices[0]
    ? pricingCheck.recommendedServices[0].customerQuoteVnd
    : undefined;
  const autoBaseCost = pricingCheck.hasStandardPrice && pricingCheck.recommendedServices[0]
    ? pricingCheck.recommendedServices[0].baseCostVnd
    : undefined;

  const status = orderData.status || (pricingCheck.hasStandardPrice ? 'created' : 'quoting');
  const customerName = orderData.customerName || orderData.shippingInfo?.sender?.name || '';
  const customerPhone = orderData.customerPhone || orderData.shippingInfo?.sender?.phone || '';
  const source = orderData.source || 'web';
  const shippingInfo = orderData.shippingInfo;
  const createdAt = new Date().toLocaleString('vi-VN');
  const estimatedPrice = orderData.estimatedPrice ?? autoPrice;
  const baseCostVnd = orderData.baseCostVnd ?? autoBaseCost;

  const record: OrderRecordDB = {
    id,
    trackingCode,
    createdAt,
    status,
    customerName,
    customerPhone,
    zaloUserId: orderData.zaloUserId,
    chatSessionId: orderData.chatSessionId,
    estimatedPrice,
    baseCostVnd,
    quotedBy: orderData.quotedBy,
    quotedAt: orderData.quotedAt,
    quoteNote: orderData.quoteNote,
    source,
    shippingInfo,
  };

  const existingIdx = inMemoryOrders.findIndex((o) => o.id === id || o.trackingCode === trackingCode);
  if (existingIdx >= 0) {
    inMemoryOrders[existingIdx] = record;
  } else {
    inMemoryOrders.unshift(record);
  }

  if (dbPool) {
    try {
      await dbPool.query(
        `INSERT INTO shipping_orders (id, tracking_code, status, customer_name, customer_phone, zalo_user_id, chat_session_id, base_cost_vnd, customer_quote_vnd, quoted_by, quote_note, source, shipping_info, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
         ON CONFLICT (id) DO UPDATE
         SET tracking_code = EXCLUDED.tracking_code,
             status = EXCLUDED.status,
             customer_name = EXCLUDED.customer_name,
             customer_phone = EXCLUDED.customer_phone,
             zalo_user_id = COALESCE(EXCLUDED.zalo_user_id, shipping_orders.zalo_user_id),
             chat_session_id = COALESCE(EXCLUDED.chat_session_id, shipping_orders.chat_session_id),
             base_cost_vnd = COALESCE(EXCLUDED.base_cost_vnd, shipping_orders.base_cost_vnd),
             customer_quote_vnd = COALESCE(EXCLUDED.customer_quote_vnd, shipping_orders.customer_quote_vnd),
             quoted_by = COALESCE(EXCLUDED.quoted_by, shipping_orders.quoted_by),
             quote_note = COALESCE(EXCLUDED.quote_note, shipping_orders.quote_note),
             source = EXCLUDED.source,
             shipping_info = EXCLUDED.shipping_info;`,
        [
          id,
          trackingCode,
          status,
          customerName,
          customerPhone,
          orderData.zaloUserId || null,
          orderData.chatSessionId || null,
          baseCostVnd ?? null,
          estimatedPrice ?? null,
          orderData.quotedBy || null,
          orderData.quoteNote || null,
          source,
          JSON.stringify(shippingInfo),
        ]
      );
      console.log(`[Database] Saved shipping order ${trackingCode} (${source}, status=${status}, session=${orderData.chatSessionId || 'N/A'}) to PostgreSQL.`);
    } catch (err: any) {
      console.error('[Database] Failed to save shipping order to PostgreSQL:', err?.message);
    }
  }

  // Tự động đẩy đơn hàng sang Zalo nhân sự vận hành DCE Ops (0934691766) để gửi Supplier báo giá
  notifyDceOps({
    id,
    trackingCode,
    status,
    customerName,
    customerPhone,
    source,
    shippingInfo,
  }).catch((err) => console.error('[DCE Ops Auto-Notify Error]', err?.message));

  return record;
}

// Fetch official Zalo user profile if available
async function fetchZaloUserProfile(userId: string): Promise<{ display_name?: string; avatar?: string; phone?: string } | null> {
  const token = currentZaloAccessToken || process.env.ZALO_OA_ACCESS_TOKEN || '';
  if (!token) return null;

  try {
    const res = await fetch(`https://openapi.zalo.me/v2.0/oa/getprofile?data=${encodeURIComponent(JSON.stringify({ user_id: userId }))}`, {
      headers: { access_token: token },
    });
    const json = await res.json();
    if (json?.error === 0 && json?.data) {
      return {
        display_name: json.data.display_name,
        avatar: json.data.avatar,
        phone: json.data.shared_info?.phone ? String(json.data.shared_info.phone) : undefined,
      };
    }
  } catch (_) { }
  return null;
}

// Record every message into CRM (both in-memory and PostgreSQL), bound to the active 24h chat session ID
async function recordCrmInteraction(
  userId: string,
  sender: 'user' | 'bot' | 'agent',
  messageText: string,
  shippingInfo?: any,
  senderName?: string,
  sessionId?: string
) {
  const now = new Date().toISOString();
  const sess = zaloUserSessions.get(userId);
  const existingCust = inMemoryCustomers.get(userId);
  const activeSessionId = sessionId || sess?.sessionId || existingCust?.current_session_id || generateChatSessionId();
  const sessionStartedIso = sess?.sessionStartedAt
    ? new Date(sess.sessionStartedAt).toISOString()
    : existingCust?.session_started_at || now;

  // Try extracting name, phone, address from shippingInfo if present
  const detectedName = shippingInfo?.sender?.name || shippingInfo?.receiver?.name || '';
  const detectedPhone = shippingInfo?.sender?.phone || shippingInfo?.receiver?.phone || '';
  const detectedAddress = shippingInfo?.sender?.address || shippingInfo?.pickup?.address || shippingInfo?.receiver?.address || '';

  // Get or initialize customer
  let customer = existingCust;
  if (!customer) {
    customer = {
      user_id: userId,
      name: detectedName || `Khách Zalo (${userId.slice(-4)})`,
      phone: detectedPhone || '',
      address: detectedAddress || '',
      avatar: '',
      order_count: shippingInfo?.isComplete || shippingInfo?.isConfirmed ? 1 : 0,
      first_interaction: now,
      last_interaction: now,
      last_message: messageText,
      human_takeover: Boolean(sess?.humanTakeover || sender === 'agent'),
      current_session_id: activeSessionId,
      session_started_at: sessionStartedIso,
      shipping_info: shippingInfo || {},
    };
    inMemoryCustomers.set(userId, customer);

    // Try fetching Zalo profile in background
    fetchZaloUserProfile(userId).then((profile) => {
      if (profile && customer) {
        if (profile.display_name) customer.name = profile.display_name;
        if (profile.avatar) customer.avatar = profile.avatar;
        if (profile.phone && !customer.phone) customer.phone = profile.phone;
        if (dbPool) {
          dbPool.query(
            `UPDATE crm_customers SET name = $1, avatar = $2, phone = COALESCE(NULLIF(phone, ''), $3) WHERE user_id = $4`,
            [customer.name, customer.avatar, customer.phone, userId]
          ).catch(() => { });
        }
      }
    });
  } else {
    customer.last_interaction = now;
    customer.last_message = messageText;
    customer.current_session_id = activeSessionId;
    customer.session_started_at = sessionStartedIso;
    if (sender === 'agent') {
      customer.human_takeover = true;
    }
    if (detectedName && (customer.name.startsWith('Khách Zalo') || !customer.name)) {
      customer.name = detectedName;
    }
    if (detectedPhone && !customer.phone) {
      customer.phone = detectedPhone;
    }
    if (detectedAddress && !customer.address) {
      customer.address = detectedAddress;
    }
    if (shippingInfo) {
      customer.shipping_info = shippingInfo;
      if (shippingInfo.isComplete || shippingInfo.isConfirmed) {
        customer.order_count = (customer.order_count || 0) + 1;
        // Auto-save confirmed order from Zalo OA into PostgreSQL shipbot-db (scoped per chat session!)
        const alreadySavedInSession = inMemoryOrders.some(
          (o) => (activeSessionId && o.chatSessionId === activeSessionId) || (!o.chatSessionId && o.id.includes(userId))
        );
        if (!alreadySavedInSession) {
          saveShippingOrder({
            id: `zalo-ord-${userId}-${Date.now()}`,
            trackingCode: shippingInfo?.trackingCode || generateTrackingCode(),
            customerName: customer.name,
            customerPhone: customer.phone,
            zaloUserId: userId,
            chatSessionId: activeSessionId,
            source: 'zalo',
            shippingInfo,
          }).catch(() => { });
        }
      }
    }
  }

  // Record Message
  const resolvedSenderName = senderName || (sender === 'user' ? customer.name : sender === 'agent' ? 'Tư vấn viên' : 'ShipBot AI');
  const msgEntry: CrmMessage = {
    id: Date.now() + Math.random(),
    user_id: userId,
    session_id: activeSessionId,
    sender,
    sender_name: resolvedSenderName,
    message_text: messageText,
    shipping_info_snapshot: shippingInfo || null,
    created_at: now,
  };
  inMemoryMessages.push(msgEntry);
  if (inMemoryMessages.length > 2000) inMemoryMessages.shift();

  // Persist to PostgreSQL if connected
  if (dbPool) {
    try {
      await dbPool.query(`
        INSERT INTO crm_customers (user_id, name, phone, address, avatar, order_count, first_interaction, last_interaction, last_message, human_takeover, current_session_id, session_started_at, shipping_info)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (user_id) DO UPDATE
        SET name = COALESCE(NULLIF(EXCLUDED.name, ''), crm_customers.name),
            phone = COALESCE(NULLIF(EXCLUDED.phone, ''), crm_customers.phone),
            address = COALESCE(NULLIF(EXCLUDED.address, ''), crm_customers.address),
            avatar = COALESCE(NULLIF(EXCLUDED.avatar, ''), crm_customers.avatar),
            order_count = crm_customers.order_count + (CASE WHEN ($13::jsonb->>'isConfirmed')::boolean = true THEN 1 ELSE 0 END),
            last_interaction = EXCLUDED.last_interaction,
            last_message = EXCLUDED.last_message,
            human_takeover = COALESCE(EXCLUDED.human_takeover, crm_customers.human_takeover),
            current_session_id = EXCLUDED.current_session_id,
            session_started_at = EXCLUDED.session_started_at,
            shipping_info = EXCLUDED.shipping_info;
      `, [
        customer.user_id,
        customer.name,
        customer.phone,
        customer.address,
        customer.avatar,
        customer.order_count,
        customer.first_interaction,
        customer.last_interaction,
        customer.last_message,
        Boolean(customer.human_takeover),
        activeSessionId,
        sessionStartedIso,
        JSON.stringify(customer.shipping_info || {}),
      ]);

      await dbPool.query(`
        INSERT INTO crm_messages (user_id, session_id, sender, sender_name, message_text, shipping_info_snapshot, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7);
      `, [
        userId,
        activeSessionId,
        sender,
        resolvedSenderName,
        messageText,
        shippingInfo ? JSON.stringify(shippingInfo) : null,
        now,
      ]);
    } catch (dbErr: any) {
      console.error('[CRM Database] Error saving CRM record:', dbErr?.message);
    }
  }
}

// Initialize PostgreSQL tables and restore tokens, sessions & CRM data
async function initDatabaseAndRestore() {
  if (!dbPool) return;
  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS zalo_auth (
        id VARCHAR(50) PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS zalo_sessions (
        user_id VARCHAR(100) PRIMARY KEY,
        session_data JSONB NOT NULL,
        last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS crm_customers (
        user_id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        avatar TEXT,
        order_count INT DEFAULT 0,
        first_interaction TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_interaction TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_message TEXT,
        shipping_info JSONB
      );
      CREATE TABLE IF NOT EXISTS crm_messages (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL,
        sender VARCHAR(20) NOT NULL,
        sender_name VARCHAR(255),
        message_text TEXT NOT NULL,
        shipping_info_snapshot JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS shipping_orders (
        id VARCHAR(100) PRIMARY KEY,
        tracking_code VARCHAR(50) NOT NULL UNIQUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        status VARCHAR(50) DEFAULT 'created',
        customer_name VARCHAR(255),
        customer_phone VARCHAR(50),
        source VARCHAR(50) DEFAULT 'web',
        shipping_info JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bot_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS standard_price_routes (
        id VARCHAR(100) PRIMARY KEY,
        route_code VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        origin_province VARCHAR(100) NOT NULL,
        destination_province VARCHAR(100) NOT NULL,
        service_code VARCHAR(50) NOT NULL,
        service_name VARCHAR(255) NOT NULL,
        estimated_transit_time VARCHAR(100) NOT NULL,
        margin_percent NUMERIC DEFAULT 30,
        tiers JSONB NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS ops_notified BOOLEAN DEFAULT FALSE;
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS ops_notified_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS zalo_user_id VARCHAR(100);
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS base_cost_vnd NUMERIC;
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS customer_quote_vnd NUMERIC;
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS quoted_by VARCHAR(100);
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS quoted_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS quote_note TEXT;
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30);
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'unpaid';
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS payment_ref VARCHAR(150);
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS negotiation_used BOOLEAN DEFAULT FALSE;
      ALTER TABLE crm_customers ADD COLUMN IF NOT EXISTS human_takeover BOOLEAN DEFAULT FALSE;
      ALTER TABLE crm_customers ADD COLUMN IF NOT EXISTS current_session_id VARCHAR(50);
      ALTER TABLE crm_customers ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS session_id VARCHAR(50);
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS chat_session_id VARCHAR(50);
      CREATE TABLE IF NOT EXISTS asterisk_call_logs (
        id VARCHAR(100) PRIMARY KEY,
        caller_phone VARCHAR(50) NOT NULL,
        normalized_phone VARCHAR(50) NOT NULL,
        unique_id VARCHAR(100),
        zalo_user_id VARCHAR(100),
        channel_used VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_crm_messages_user_id ON crm_messages(user_id);
      CREATE INDEX IF NOT EXISTS idx_crm_messages_session_id ON crm_messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_crm_customers_last_interaction ON crm_customers(last_interaction DESC);
      CREATE INDEX IF NOT EXISTS idx_shipping_orders_created_at ON shipping_orders(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_asterisk_calls_created_at ON asterisk_call_logs(created_at DESC);
    `);
    console.log('[Database] PostgreSQL tables (auth, sessions, CRM, shipping_orders) initialized successfully.');

    // 1. Restore tokens from PostgreSQL
    const tokenRes = await dbPool.query(`SELECT access_token, refresh_token, updated_at FROM zalo_auth WHERE id = 'default' LIMIT 1`);
    if (tokenRes.rows.length > 0) {
      const row = tokenRes.rows[0];
      if (row.access_token) currentZaloAccessToken = row.access_token;
      if (row.refresh_token) currentZaloRefreshToken = row.refresh_token;
      if (row.updated_at) lastTokenRefreshTimestamp = new Date(row.updated_at).getTime();
      console.log('[Database] Successfully restored active Zalo tokens from PostgreSQL!');
    } else if (currentZaloAccessToken || process.env.ZALO_OA_ACCESS_TOKEN) {
      // First boot with new DB: Seed DB with the current active token!
      const initialAccess = currentZaloAccessToken || process.env.ZALO_OA_ACCESS_TOKEN || '';
      const initialRefresh = currentZaloRefreshToken || process.env.ZALO_REFRESH_TOKEN || '';
      await dbPool.query(`
        INSERT INTO zalo_auth (id, access_token, refresh_token, updated_at)
        VALUES ('default', $1, $2, NOW())
        ON CONFLICT (id) DO NOTHING;
      `, [initialAccess, initialRefresh]);
      console.log('[Database] Seeded initial Zalo tokens into PostgreSQL from environment.');
    }

    // 2. Restore active sessions from PostgreSQL (skip sessions already expired past 24h fixed window)
    const sessRes = await dbPool.query(`SELECT user_id, session_data FROM zalo_sessions`);
    const nowRestore = Date.now();
    for (const r of sessRes.rows) {
      const sd = r.session_data || {};
      if (!isSessionExpired24h(sd, nowRestore)) {
        zaloUserSessions.set(r.user_id, sd);
      }
    }
    if (sessRes.rows.length > 0) {
      console.log(`[Database] Successfully restored ${zaloUserSessions.size}/${sessRes.rows.length} active (<24h) sessions from PostgreSQL!`);
    }

    // 3. Restore CRM Customers from PostgreSQL
    const custRes = await dbPool.query(`SELECT * FROM crm_customers ORDER BY last_interaction DESC LIMIT 100`);
    for (const r of custRes.rows) {
      const sessionStartedIso = r.session_started_at ? new Date(r.session_started_at).toISOString() : undefined;
      const sessionStillValid = sessionStartedIso ? (nowRestore - new Date(sessionStartedIso).getTime() < CHAT_SESSION_TTL_MS) : true;
      inMemoryCustomers.set(r.user_id, {
        user_id: r.user_id,
        name: r.name || `Khách Zalo (${r.user_id.slice(-4)})`,
        phone: r.phone || '',
        address: r.address || '',
        avatar: r.avatar || '',
        order_count: r.order_count || 0,
        first_interaction: r.first_interaction ? new Date(r.first_interaction).toISOString() : new Date().toISOString(),
        last_interaction: r.last_interaction ? new Date(r.last_interaction).toISOString() : new Date().toISOString(),
        last_message: r.last_message || '',
        human_takeover: sessionStillValid ? Boolean(r.human_takeover) : false,
        current_session_id: r.current_session_id || undefined,
        session_started_at: sessionStartedIso,
        shipping_info: r.shipping_info || {},
      });
    }
    if (custRes.rows.length > 0) {
      console.log(`[Database] Successfully restored ${custRes.rows.length} CRM customers from PostgreSQL!`);
    }

    // 4. Restore recent CRM Messages from PostgreSQL
    const msgRes = await dbPool.query(`SELECT * FROM crm_messages ORDER BY created_at DESC LIMIT 500`);
    for (const r of msgRes.rows.reverse()) {
      inMemoryMessages.push({
        id: r.id,
        user_id: r.user_id,
        session_id: r.session_id || undefined,
        sender: r.sender,
        sender_name: r.sender_name,
        message_text: r.message_text,
        shipping_info_snapshot: r.shipping_info_snapshot,
        created_at: new Date(r.created_at).toISOString(),
      });
    }
    if (msgRes.rows.length > 0) {
      console.log(`[Database] Successfully restored ${msgRes.rows.length} CRM messages from PostgreSQL!`);
    }

    // 5. Restore Shipping Orders from PostgreSQL
    const ordRes = await dbPool.query(`SELECT * FROM shipping_orders ORDER BY created_at DESC LIMIT 100`);
    inMemoryOrders.length = 0;
    for (const r of ordRes.rows) {
      inMemoryOrders.push({
        id: r.id,
        trackingCode: r.tracking_code,
        createdAt: r.created_at ? new Date(r.created_at).toLocaleString('vi-VN') : new Date().toLocaleString('vi-VN'),
        status: r.status || 'created',
        customerName: r.customer_name || '',
        customerPhone: r.customer_phone || '',
        zaloUserId: r.zalo_user_id || undefined,
        chatSessionId: r.chat_session_id || undefined,
        baseCostVnd: r.base_cost_vnd != null ? Number(r.base_cost_vnd) : undefined,
        estimatedPrice: r.customer_quote_vnd != null ? Number(r.customer_quote_vnd) : undefined,
        quotedBy: r.quoted_by || undefined,
        quotedAt: r.quoted_at ? new Date(r.quoted_at).toISOString() : undefined,
        quoteNote: r.quote_note || undefined,
        paymentMethod: r.payment_method || undefined,
        paymentStatus: r.payment_status || 'unpaid',
        paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : undefined,
        paymentRef: r.payment_ref || undefined,
        negotiationUsed: Boolean(r.negotiation_used),
        source: (r.source as 'web' | 'zalo') || 'web',
        shippingInfo: r.shipping_info,
      });
    }
    if (ordRes.rows.length > 0) {
      console.log(`[Database] Successfully restored ${ordRes.rows.length} shipping orders from PostgreSQL!`);
    }

    // 6. Restore DCE Ops, Default Supplier, Payment Bank & Asterisk ZNS Configuration from PostgreSQL
    try {
      const settingsRes = await dbPool.query(`SELECT key, value FROM bot_settings WHERE key IN ('dce_ops_phone', 'dce_ops_user_id', 'default_supplier_name', 'default_supplier_phone', 'default_supplier_user_id', 'payment_bank_id', 'payment_account_no', 'payment_account_name', 'zalo_zns_template_id')`);
      const settingsMap = new Map<string, string>();
      for (const row of settingsRes.rows) {
        if (row.value) settingsMap.set(row.key, row.value);
      }

      if (settingsMap.get('dce_ops_phone')) dceOpsPhone = settingsMap.get('dce_ops_phone')!;
      if (settingsMap.get('dce_ops_user_id')) dceOpsUserId = settingsMap.get('dce_ops_user_id')!;
      if (settingsMap.get('default_supplier_name')) defaultSupplierName = settingsMap.get('default_supplier_name')!;
      if (settingsMap.get('default_supplier_phone')) defaultSupplierPhone = settingsMap.get('default_supplier_phone')!;
      if (settingsMap.get('default_supplier_user_id')) defaultSupplierUserId = settingsMap.get('default_supplier_user_id')!;
      if (settingsMap.get('payment_bank_id')) paymentBankId = settingsMap.get('payment_bank_id')!;
      if (settingsMap.get('payment_account_no')) paymentAccountNo = settingsMap.get('payment_account_no')!;
      if (settingsMap.get('payment_account_name')) paymentAccountName = settingsMap.get('payment_account_name')!;
      if (settingsMap.get('zalo_zns_template_id')) zaloZnsTemplateId = settingsMap.get('zalo_zns_template_id')!;

      const callRes = await dbPool.query(`SELECT * FROM asterisk_call_logs ORDER BY created_at DESC LIMIT 50`);
      inMemoryCallLogs.length = 0;
      for (const r of callRes.rows) {
        inMemoryCallLogs.push({
          id: r.id,
          callerPhone: r.caller_phone,
          normalizedPhone: r.normalized_phone,
          uniqueId: r.unique_id || undefined,
          zaloUserId: r.zalo_user_id || undefined,
          channelUsed: r.channel_used,
          status: r.status,
          createdAt: r.created_at ? new Date(r.created_at).toLocaleString('vi-VN') : '',
        });
      }

      if (!dceOpsUserId && dceOpsPhone) {
        const tailOps = dceOpsPhone.replace(/\D/g, '').slice(-9);
        const phoneMatch = await dbPool.query(`SELECT user_id FROM crm_customers WHERE phone LIKE $1 ORDER BY last_interaction DESC LIMIT 1`, [`%${tailOps}%`]);
        if (phoneMatch.rows.length > 0 && phoneMatch.rows[0].user_id) {
          dceOpsUserId = phoneMatch.rows[0].user_id;
          console.log(`[Database] Auto-linked DCE Ops Zalo User ID from customer phone match: ${dceOpsUserId}`);
        }
      }

      if (!defaultSupplierUserId && defaultSupplierPhone) {
        const tailSup = defaultSupplierPhone.replace(/\D/g, '').slice(-9);
        const supMatch = await dbPool.query(`SELECT user_id FROM crm_customers WHERE phone LIKE $1 ORDER BY last_interaction DESC LIMIT 1`, [`%${tailSup}%`]);
        if (supMatch.rows.length > 0 && supMatch.rows[0].user_id) {
          defaultSupplierUserId = supMatch.rows[0].user_id;
          console.log(`[Database] Auto-linked Default Supplier Zalo User ID from customer phone match: ${defaultSupplierUserId}`);
        }
      }

      console.log(`[Database] Routing Config: Ops=${dceOpsPhone} (linked=${!!dceOpsUserId}), Supplier=${defaultSupplierName} (${defaultSupplierPhone}, linked=${!!defaultSupplierUserId})`);
    } catch (e: any) {
      console.warn('[Database] Could not restore DCE Ops & Supplier settings:', e?.message);
    }

    // 7. Seed & Restore Standard Price Routes (Pricing Engine)
    try {
      const routeRes = await dbPool.query(`SELECT * FROM standard_price_routes ORDER BY route_code ASC`);
      if (routeRes.rows.length === 0) {
        for (const r of DEFAULT_STANDARD_ROUTES) {
          await dbPool.query(
            `INSERT INTO standard_price_routes (id, route_code, name, origin_province, destination_province, service_code, service_name, estimated_transit_time, margin_percent, tiers, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (route_code) DO NOTHING;`,
            [r.id, r.routeCode, r.name, r.originProvince, r.destinationProvince, r.serviceCode, r.serviceName, r.estimatedTransitTime, r.marginPercent, JSON.stringify(r.tiers), r.isActive]
          );
        }
        activeStandardRoutes = [...DEFAULT_STANDARD_ROUTES];
        console.log(`[Database] Seeded ${DEFAULT_STANDARD_ROUTES.length} default standard price routes into PostgreSQL.`);
      } else {
        activeStandardRoutes = routeRes.rows.map((row: any) => ({
          id: row.id,
          routeCode: row.route_code,
          name: row.name,
          originProvince: row.origin_province,
          destinationProvince: row.destination_province,
          serviceCode: row.service_code,
          serviceName: row.service_name,
          estimatedTransitTime: row.estimated_transit_time,
          marginPercent: Number(row.margin_percent || 30),
          tiers: row.tiers,
          isActive: Boolean(row.is_active),
        }));
        console.log(`[Database] Loaded ${activeStandardRoutes.length} standard price routes from PostgreSQL.`);
      }
    } catch (e: any) {
      console.warn('[Database] Could not restore standard price routes:', e?.message);
    }
  } catch (e: any) {
    console.error('[Database] Failed to init or restore from PostgreSQL:', e?.message);
  }
}
initDatabaseAndRestore();

// Load cached token from disk if exists (local fallback)
try {
  if (fs.existsSync(TOKEN_CACHE_FILE)) {
    const cached = JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, 'utf-8'));
    if (cached.access_token && !currentZaloAccessToken) currentZaloAccessToken = cached.access_token;
    if (cached.refresh_token && !currentZaloRefreshToken) currentZaloRefreshToken = cached.refresh_token;
  }
} catch (e) {
  // ignore cache read error
}

function saveTokenCache(accessToken: string, refreshToken?: string) {
  try {
    const data: any = { access_token: accessToken, updated_at: new Date().toISOString() };
    if (refreshToken) data.refresh_token = refreshToken;
    fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[Zalo OA] Could not save token cache file:', e);
  }

  // Persist to PostgreSQL if connected
  if (dbPool) {
    dbPool.query(`
      INSERT INTO zalo_auth (id, access_token, refresh_token, updated_at)
      VALUES ('default', $1, $2, NOW())
      ON CONFLICT (id) DO UPDATE
      SET access_token = EXCLUDED.access_token,
          refresh_token = COALESCE(EXCLUDED.refresh_token, zalo_auth.refresh_token),
          updated_at = NOW();
    `, [accessToken, refreshToken || null]).catch((err) => {
      console.error('[Database] Failed to save token to PostgreSQL:', err?.message);
    });
  }
}

function loadSessionsCache() {
  try {
    if (fs.existsSync(SESSIONS_CACHE_FILE)) {
      const obj = JSON.parse(fs.readFileSync(SESSIONS_CACHE_FILE, 'utf-8'));
      for (const [k, v] of Object.entries(obj)) {
        if (!zaloUserSessions.has(k)) {
          zaloUserSessions.set(k, v as ZaloUserSession);
        }
      }
      console.log(`[Zalo OA] Loaded ${zaloUserSessions.size} active sessions from disk.`);
    }
  } catch (e) {
    // ignore
  }
}

function saveSessionsCache() {
  try {
    const obj: Record<string, any> = {};
    for (const [k, v] of zaloUserSessions.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(SESSIONS_CACHE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    // ignore
  }

  // Persist to PostgreSQL
  if (dbPool) {
    for (const [uid, sess] of zaloUserSessions.entries()) {
      dbPool.query(`
        INSERT INTO zalo_sessions (user_id, session_data, last_active)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET session_data = EXCLUDED.session_data, last_active = NOW();
      `, [uid, JSON.stringify(sess)]).catch(() => { });
    }
  }
}

// Initialize sessions from cache
loadSessionsCache();

// Cleanup stale sessions older than fixed 24 hours from sessionStartedAt periodically
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [uid, sess] of zaloUserSessions.entries()) {
    if (isSessionExpired24h(sess, now)) {
      zaloUserSessions.delete(uid);
      const cust = inMemoryCustomers.get(uid);
      if (cust) cust.human_takeover = false;
      changed = true;
    }
  }
  if (changed) saveSessionsCache();
}, 60 * 60 * 1000);

async function refreshZaloAccessToken(): Promise<string | null> {
  const appId = process.env.ZALO_APP_ID || '4541345519906352744';
  const secretKey = process.env.ZALO_APP_SECRET || '';
  const refreshToken = currentZaloRefreshToken || process.env.ZALO_REFRESH_TOKEN || '';

  if (!appId || !secretKey || !refreshToken) {
    const msg = 'Thiếu thông tin xác thực để làm mới token (ZALO_APP_ID, ZALO_APP_SECRET, hoặc ZALO_REFRESH_TOKEN)';
    logZaloEvent('error', msg);
    console.warn(`[Zalo OA] ${msg}`);
    return null;
  }

  try {
    logZaloEvent('token_refresh', 'Đang gửi yêu cầu làm mới Access Token tới Zalo OAuth v4...');
    const bodyParams = new URLSearchParams({
      refresh_token: refreshToken,
      app_id: appId,
      grant_type: 'refresh_token',
    });

    const res = await fetch('https://oauth.zalo.me/v4/oa/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': secretKey,
      },
      body: bodyParams.toString(),
    });

    const data = await res.json();
    if (data?.access_token) {
      currentZaloAccessToken = data.access_token;
      if (data.refresh_token) {
        currentZaloRefreshToken = data.refresh_token;
      }
      saveTokenCache(currentZaloAccessToken, currentZaloRefreshToken);
      logZaloEvent('token_refresh', 'Làm mới Access Token thành công!', {
        expires_in: data.expires_in,
      });
      return currentZaloAccessToken;
    } else {
      const errMsg = `Thất bại khi làm mới token: ${data?.error} - ${data?.error_description || data?.message || JSON.stringify(data)}`;
      logZaloEvent('error', errMsg, data);
      console.error('[Zalo OA] Failed to refresh token:', data);
      return null;
    }
  } catch (err: any) {
    const netErr = `Lỗi mạng khi gọi Zalo OAuth: ${err?.message}`;
    logZaloEvent('error', netErr);
    console.error('[Zalo OA] Refresh token network error:', err?.message);
    return null;
  }
}

async function sendZaloOAReply(userId: string, replyText: string): Promise<boolean> {
  const token = currentZaloAccessToken || process.env.ZALO_OA_ACCESS_TOKEN || '';
  if (!token) {
    const msg = 'ZALO_OA_ACCESS_TOKEN bị trống, không thể gửi tin nhắn';
    logZaloEvent('error', msg);
    console.warn(`[Zalo OA] ${msg}`);
    return false;
  }

  async function callZaloApi(authToken: string) {
    markBotSentMessage(userId, replyText);
    return await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': authToken,
      },
      body: JSON.stringify({
        recipient: { user_id: userId },
        message: { text: replyText },
      }),
    });
  }

  try {
    let res = await callZaloApi(token);
    let data = await res.json();
    console.log('[Zalo OA] Send response:', data);

    // If token expired (error code -216 or token expired message), attempt auto-refresh and retry once
    if (data?.error === -216 || data?.error === -204 || data?.error === -205 || (typeof data?.message === 'string' && data.message.toLowerCase().includes('token'))) {
      logZaloEvent('token_refresh', 'Access Token hết hạn (-216), hệ thống đang thử tự động làm mới...');
      const newToken = await refreshZaloAccessToken();
      if (newToken) {
        res = await callZaloApi(newToken);
        data = await res.json();
        console.log('[Zalo OA] Retry response after refresh:', data);
      }
    }

    if (data?.error === 0) {
      logZaloEvent('outgoing_reply', `Đã gửi trả lời tới user ${userId}`, {
        text: replyText.slice(0, 120),
        zaloMsgId: data?.data?.message_id,
      });
      return true;
    } else {
      logZaloEvent('error', `Lỗi khi gửi tin tới Zalo: Mã ${data?.error} - ${data?.message}`, data);
      return false;
    }
  } catch (err: any) {
    logZaloEvent('error', `Ngoại lệ khi gửi tin Zalo: ${err?.message}`);
    console.error('[Zalo OA] Error sending message:', err);
    return false;
  }
}

// Đẩy thông tin đơn hàng tới Zalo của nhân sự điều phối vận hành (DCE Ops - 0934691766) để gửi Supplier báo giá
export async function notifyDceOps(orderData: {
  id?: string;
  trackingCode: string;
  status?: string;
  customerName?: string;
  customerPhone?: string;
  source?: string;
  shippingInfo: any;
}): Promise<{
  success: boolean;
  notified: boolean;
  text: string;
  opsPhone: string;
  opsUserId: string | null;
  error?: string;
}> {
  const opsPhone = dceOpsPhone || DCE_OPS_PHONE;
  const opsNotificationText = generateOpsShipmentNotification(
    orderData.shippingInfo,
    orderData.trackingCode,
    orderData.source || 'web',
    orderData.customerName,
    orderData.customerPhone
  );

  // 1. Nếu chưa có dceOpsUserId, thử dò tìm trong crm_customers theo số opsPhone
  if (!dceOpsUserId && dbPool) {
    try {
      const tailOps = opsPhone.replace(/\D/g, '').slice(-9);
      const res = await dbPool.query(
        `SELECT user_id FROM crm_customers WHERE phone LIKE $1 OR name ILIKE '%ops%' ORDER BY last_interaction DESC LIMIT 1`,
        [`%${tailOps}%`]
      );
      if (res.rows.length > 0 && res.rows[0].user_id) {
        dceOpsUserId = res.rows[0].user_id;
        console.log(`[DCE Ops] Auto-resolved dceOpsUserId from crm_customers: ${dceOpsUserId}`);
      }
    } catch (_) {}
  }

  // Nếu có đơn chưa có giá chuẩn & defaultSupplierUserId đã liên kết -> gửi song song cho Nhà cung cấp mặc định
  const pricingCheck = calculateDCExpressPriceFromShippingInfo(orderData.shippingInfo, activeStandardRoutes);
  if (!pricingCheck.hasStandardPrice && defaultSupplierUserId && defaultSupplierUserId !== dceOpsUserId) {
    sendZaloOAReply(defaultSupplierUserId, opsNotificationText)
      .then((ok) => {
        if (ok) {
          logZaloEvent('outgoing_reply', `Đã tự động gửi yêu cầu báo giá đơn ${orderData.trackingCode} tới Nhà cung cấp mặc định (${defaultSupplierName} - ${defaultSupplierPhone})`);
        }
      })
      .catch(() => {});
  }

  // 2. Nếu đã liên kết Zalo user_id của Ops -> Bắn tin nhắn trực tiếp qua Zalo OA
  if (dceOpsUserId) {
    try {
      const sent = await sendZaloOAReply(dceOpsUserId, opsNotificationText);
      if (sent) {
        logZaloEvent('outgoing_reply', `Đã bắn thông tin đơn ${orderData.trackingCode} tới Zalo DCE Ops (${opsPhone})`, {
          trackingCode: orderData.trackingCode,
          opsPhone,
          opsUserId: dceOpsUserId,
        });

        // Ghi lại vào CRM
        await recordCrmInteraction(
          dceOpsUserId,
          'bot',
          opsNotificationText,
          orderData.shippingInfo,
          'Thông Báo Đơn Cho DCE Ops'
        );

        // Đánh dấu đơn đã thông báo cho Ops trong Database
        if (dbPool) {
          dbPool.query(
            `UPDATE shipping_orders SET ops_notified = TRUE, ops_notified_at = NOW() WHERE tracking_code = $1`,
            [orderData.trackingCode]
          ).catch(() => {});
        }

        return {
          success: true,
          notified: true,
          text: opsNotificationText,
          opsPhone,
          opsUserId: dceOpsUserId,
        };
      } else {
        return {
          success: false,
          notified: false,
          text: opsNotificationText,
          opsPhone,
          opsUserId: dceOpsUserId,
          error: 'Gửi tin qua Zalo OA thất bại. Kiểm tra Access Token hoặc quyền tin CS.',
        };
      }
    } catch (err: any) {
      console.error('[DCE Ops Notification] Error sending to Ops:', err?.message);
      return {
        success: false,
        notified: false,
        text: opsNotificationText,
        opsPhone,
        opsUserId: dceOpsUserId,
        error: err?.message,
      };
    }
  }

  console.log(`[DCE Ops] Đơn hàng ${orderData.trackingCode} đã ghi nhận. Chưa liên kết Zalo user_id của Ops (${opsPhone}). Ops có thể nhắn #ops tới Zalo OA.`);
  return {
    success: true,
    notified: false,
    text: opsNotificationText,
    opsPhone,
    opsUserId: null,
    error: 'Chưa liên kết Zalo user_id của Ops (hãy nhắn #ops tới Zalo OA từ 0934691766 để kích hoạt đẩy tự động)',
  };
}

// Parse số tiền tiếng Việt từ text (VD: "450000", "450.000", "450k", "1.2tr")
function parseVietnameseMoney(raw: string): number {
  const s = String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return 0;
  const trMatch = s.match(/^(\d+(?:[.,]\d+)?)tr(?:iệu)?$/i);
  if (trMatch) {
    return Math.round(parseFloat(trMatch[1].replace(',', '.')) * 1000000);
  }
  const kMatch = s.match(/^(\d+(?:[.,]\d+)?)k$/i);
  if (kMatch) {
    return Math.round(parseFloat(kMatch[1].replace(',', '.')) * 1000);
  }
  const digits = s.replace(/[^\d]/g, '');
  if (!digits) return 0;
  const num = parseInt(digits, 10);
  // Nếu nhập số nhỏ như "450" hiểu là 450.000đ
  return num > 0 && num < 5000 ? num * 1000 : num;
}

// Tìm đơn hàng theo mã đầy đủ (VN-LOG-1611-8191) hoặc 4 số cuối (8191)
async function findOrderByTrackingCodeOrSuffix(codeInput: string): Promise<OrderRecordDB | null> {
  const clean = String(codeInput || '').trim().toUpperCase();
  if (!clean) return null;

  const memMatch = inMemoryOrders.find(
    (o) => o.trackingCode.toUpperCase() === clean || o.trackingCode.toUpperCase().endsWith(`-${clean}`)
  );
  if (memMatch) return memMatch;

  if (dbPool) {
    try {
      const dbRes = await dbPool.query(
        `SELECT * FROM shipping_orders WHERE UPPER(tracking_code) = $1 OR UPPER(tracking_code) LIKE $2 ORDER BY created_at DESC LIMIT 1`,
        [clean, `%-${clean}`]
      );
      if (dbRes.rows.length > 0) {
        const r = dbRes.rows[0];
        return {
          id: r.id,
          trackingCode: r.tracking_code,
          createdAt: r.created_at ? new Date(r.created_at).toLocaleString('vi-VN') : new Date().toLocaleString('vi-VN'),
          status: r.status || 'created',
          customerName: r.customer_name || '',
          customerPhone: r.customer_phone || '',
          zaloUserId: r.zalo_user_id || undefined,
          baseCostVnd: r.base_cost_vnd != null ? Number(r.base_cost_vnd) : undefined,
          estimatedPrice: r.customer_quote_vnd != null ? Number(r.customer_quote_vnd) : undefined,
          quotedBy: r.quoted_by || undefined,
          quotedAt: r.quoted_at ? new Date(r.quoted_at).toISOString() : undefined,
          quoteNote: r.quote_note || undefined,
          source: (r.source as 'web' | 'zalo') || 'web',
          shippingInfo: r.shipping_info,
        };
      }
    } catch (_) {}
  }
  return null;
}

// Áp dụng báo giá từ Ops / Default Supplier cho đơn hàng ngoại lệ & gửi báo giá lại cho Khách
async function applyOrderQuote(params: {
  codeOrSuffix: string;
  inputAmountVnd: number;
  applyMargin?: boolean;
  quotedBy?: string;
  quoteNote?: string;
}): Promise<{
  success: boolean;
  order?: OrderRecordDB;
  baseCostVnd?: number;
  customerQuoteVnd?: number;
  customerNotified?: boolean;
  error?: string;
}> {
  const order = await findOrderByTrackingCodeOrSuffix(params.codeOrSuffix);
  if (!order) {
    return { success: false, error: `Không tìm thấy đơn hàng với mã "${params.codeOrSuffix}"` };
  }
  if (!params.inputAmountVnd || params.inputAmountVnd <= 0) {
    return { success: false, error: 'Số tiền báo giá không hợp lệ' };
  }

  const applyMargin = params.applyMargin !== false;
  const baseCostVnd = Math.round(params.inputAmountVnd);
  const customerQuoteVnd = applyMargin ? Math.round((baseCostVnd * 1.3) / 1000) * 1000 : baseCostVnd;
  const quotedBy = params.quotedBy || `DCE Ops (${dceOpsPhone})`;
  const quotedAt = new Date().toISOString();

  order.status = 'quoted';
  order.baseCostVnd = baseCostVnd;
  order.estimatedPrice = customerQuoteVnd;
  order.quotedBy = quotedBy;
  order.quotedAt = quotedAt;
  order.quoteNote = params.quoteNote;

  const memIdx = inMemoryOrders.findIndex((o) => o.id === order.id);
  if (memIdx >= 0) {
    inMemoryOrders[memIdx] = order;
  } else {
    inMemoryOrders.unshift(order);
  }

  if (dbPool) {
    try {
      await dbPool.query(
        `UPDATE shipping_orders
         SET status = 'quoted',
             base_cost_vnd = $1,
             customer_quote_vnd = $2,
             quoted_by = $3,
             quoted_at = NOW(),
             quote_note = $4
         WHERE tracking_code = $5`,
        [baseCostVnd, customerQuoteVnd, quotedBy, params.quoteNote || null, order.trackingCode]
      );
    } catch (e: any) {
      console.error('[Quick Quote] Failed to update DB:', e?.message);
    }
  }

  // Tự động gửi báo giá lại cho Khách hàng qua Zalo OA nếu đơn có zaloUserId
  let customerNotified = false;
  const targetCustomerId =
    order.zaloUserId ||
    (order.id.startsWith('zalo-ord-') ? order.id.split('-')[2] : undefined);

  if (targetCustomerId) {
    const sAddr = order.shippingInfo?.sender?.address || '(Chưa có)';
    const rAddr = order.shippingInfo?.receiver?.address || '(Chưa có)';
    const cargo = order.shippingInfo?.cargo?.name || 'Hàng hóa';
    const weight = order.shippingInfo?.cargo?.weight || (order.shippingInfo?.cargo?.weightKg ? `${order.shippingInfo.cargo.weightKg}kg` : '');
    const dt = order.shippingInfo?.deliveryTime || 'Theo thỏa thuận';

    const customerMsg = `💰 [ĐI CHUNG EXPRESS - BÁO GIÁ ĐƠN HÀNG ${order.trackingCode}]
-----------------------------
📍 Điểm lấy: ${sAddr}
🎯 Điểm giao: ${rAddr}
📦 Hàng hóa: ${cargo}${weight ? ` (${weight})` : ''}
⏰ Thời gian: ${dt}

💵 CƯỚC VẬN CHUYỂN TRỌN GÓI: ${formatVnd(customerQuoteVnd)}${params.quoteNote ? `\n📝 Ghi chú: ${params.quoteNote}` : ''}
-----------------------------
👉 Anh/chị vui lòng nhắn "Đồng ý" hoặc "Chốt đơn" để bên em lên lệnh lấy hàng và gửi thông tin thanh toán nhé ạ!`;

    customerNotified = await sendZaloOAReply(targetCustomerId, customerMsg);
    if (customerNotified) {
      await recordCrmInteraction(targetCustomerId, 'bot', customerMsg, order.shippingInfo, 'Báo Giá Từ Điều Phối');
      const sess = zaloUserSessions.get(targetCustomerId);
      if (sess) {
        sess.history.push({ role: 'model', content: customerMsg });
        saveSessionsCache();
      }
    }
  }

  // Gửi xác nhận lại cho DCE Ops
  if (dceOpsUserId) {
    const opsAck = `✅ Đã cập nhật báo giá đơn ${order.trackingCode} (${quotedBy}):\n- Giá gốc: ${formatVnd(baseCostVnd)}\n- Giá báo khách: ${formatVnd(customerQuoteVnd)}${customerNotified ? '\n📲 Đã tự động gửi báo giá tới Zalo khách hàng!' : ''}`;
    sendZaloOAReply(dceOpsUserId, opsAck).catch(() => {});
  }

  logZaloEvent('outgoing_reply', `Cập nhật báo giá đơn ${order.trackingCode}: ${formatVnd(customerQuoteVnd)} (Gốc: ${formatVnd(baseCostVnd)})`, {
    trackingCode: order.trackingCode,
    baseCostVnd,
    customerQuoteVnd,
    quotedBy,
    customerNotified,
  });

  return {
    success: true,
    order,
    baseCostVnd,
    customerQuoteVnd,
    customerNotified,
  };
}

// Tạo bản tin Lệnh Điều Phối / Xác nhận đơn hàng chính thức (Bước 3.4) gửi Khách, Ops & Supplier
export function generateDispatchOrderText(order: OrderRecordDB): string {
  const sAddr = order.shippingInfo?.sender?.address || '(Chưa có)';
  const rAddr = order.shippingInfo?.receiver?.address || '(Chưa có)';
  const sContact = [order.shippingInfo?.sender?.name || order.customerName, order.shippingInfo?.sender?.phone || order.customerPhone].filter(Boolean).join(' - ') || '(Đang cập nhật)';
  const rContact = [order.shippingInfo?.receiver?.name, order.shippingInfo?.receiver?.phone].filter(Boolean).join(' - ') || '(Đang cập nhật)';
  const cargoName = order.shippingInfo?.cargo?.name || 'Hàng hóa';
  const weight = order.shippingInfo?.cargo?.weight || (order.shippingInfo?.cargo?.weightKg ? `${order.shippingInfo.cargo.weightKg}kg` : 'Theo thực tế');
  const deliveryTime = order.shippingInfo?.deliveryTime || 'Theo thỏa thuận';
  const priceStr = order.estimatedPrice ? formatVnd(order.estimatedPrice) : 'Theo thỏa thuận';
  const paymentStr =
    order.paymentStatus === 'paid'
      ? `✅ ĐÃ THANH TOÁN (Chuyển khoản VietQR${order.paymentRef ? ` - Mã GD: ${order.paymentRef}` : ''})`
      : '💵 THU HỘ COD / TIỀN MẶT KHI LẤY & GIAO HÀNG';

  return `🚀 [ĐI CHUNG EXPRESS - LỆNH ĐIỀU PHỐI LẤY HÀNG CHÍNH THỨC]
📋 Mã vận đơn: ${order.trackingCode}
---------------------------------------------
💰 GIÁ CƯỚC ĐÃ CHỐT: ${priceStr}
💳 THANH TOÁN: ${paymentStr}

⏰ THỜI GIAN LẤY HÀNG CAM KẾT:
   ${deliveryTime}

📍 ĐỊA ĐIỂM LẤY HÀNG:
   ${sAddr}
   👤 Contact người gửi/lấy: ${sContact}

🎯 ĐỊA ĐIỂM GIAO HÀNG:
   ${rAddr}
   👤 Contact người nhận: ${rContact}

📦 HÀNG HÓA: ${cargoName} (${weight})${order.shippingInfo?.cargo?.specialNotes ? `\n📝 Ghi chú: ${order.shippingInfo.cargo.specialNotes}` : ''}
---------------------------------------------
📞 Hotline Điều phối DCE Ops: ${dceOpsPhone}
✨ Cảm ơn Quý khách & Đối tác đã đồng hành cùng Đi Chung Express!`;
}

// Hoàn tất thanh toán (VietQR / COD) & Phát hành Lệnh Điều Phối tới Khách, Ops & Supplier
async function completeOrderPaymentAndDispatch(params: {
  codeOrSuffix: string;
  method: 'vietqr' | 'cod';
  paymentRef?: string;
}): Promise<{
  success: boolean;
  order?: OrderRecordDB;
  dispatchText?: string;
  error?: string;
}> {
  const order = await findOrderByTrackingCodeOrSuffix(params.codeOrSuffix);
  if (!order) {
    return { success: false, error: `Không tìm thấy đơn hàng ${params.codeOrSuffix}` };
  }

  const isPaid = params.method === 'vietqr';
  order.status = 'dispatched';
  order.paymentMethod = params.method;
  order.paymentStatus = isPaid ? 'paid' : 'cod_pending';
  order.paidAt = isPaid ? new Date().toISOString() : undefined;
  order.paymentRef = params.paymentRef || (isPaid ? `VQR-${Date.now().toString().slice(-6)}` : undefined);

  const idx = inMemoryOrders.findIndex((o) => o.id === order.id);
  if (idx >= 0) inMemoryOrders[idx] = order;

  if (dbPool) {
    try {
      await dbPool.query(
        `UPDATE shipping_orders
         SET status = 'dispatched',
             payment_method = $1,
             payment_status = $2,
             paid_at = $3,
             payment_ref = $4
         WHERE tracking_code = $5`,
        [order.paymentMethod, order.paymentStatus, order.paidAt || null, order.paymentRef || null, order.trackingCode]
      );
    } catch (e: any) {
      console.error('[Payment/Dispatch] DB update failed:', e?.message);
    }
  }

  const dispatchText = generateDispatchOrderText(order);

  // 1. Gửi cho Khách hàng (nếu có zaloUserId)
  const targetCustomerId =
    order.zaloUserId ||
    (order.id.startsWith('zalo-ord-') ? order.id.split('-')[2] : undefined);
  if (targetCustomerId) {
    sendZaloOAReply(targetCustomerId, dispatchText)
      .then((ok) => {
        if (ok) recordCrmInteraction(targetCustomerId, 'bot', dispatchText, order.shippingInfo, 'Lệnh Điều Phối Lấy Hàng');
      })
      .catch(() => {});
  }

  // 2. Gửi cho DCE Ops
  if (dceOpsUserId) {
    sendZaloOAReply(dceOpsUserId, dispatchText).catch(() => {});
  }

  // 3. Gửi cho Nhà cung cấp mặc định (Dichung Express)
  if (defaultSupplierUserId && defaultSupplierUserId !== dceOpsUserId) {
    sendZaloOAReply(defaultSupplierUserId, dispatchText).catch(() => {});
  }

  logZaloEvent('outgoing_reply', `Phát hành Lệnh Điều Phối đơn ${order.trackingCode} (${isPaid ? 'Đã TT VietQR' : 'COD'})`, {
    trackingCode: order.trackingCode,
    paymentStatus: order.paymentStatus,
    paymentRef: order.paymentRef,
  });

  return { success: true, order, dispatchText };
}

// Xử lý tương tác Thương lượng 10% / Chốt đơn / Chọn phương thức thanh toán trên Zalo OA
async function handleCustomerClosingWorkflow(userId: string, userText: string): Promise<string | null> {
  const t = userText.trim().toLowerCase();
  const activeOrder = inMemoryOrders.find(
    (o) =>
      (o.zaloUserId === userId || o.id.includes(userId)) &&
      ['created', 'quoting', 'quoted', 'confirmed'].includes(o.status)
  );
  if (!activeOrder || !activeOrder.estimatedPrice || activeOrder.estimatedPrice <= 0) {
    return null;
  }

  const publicBaseUrl = (process.env.PUBLIC_BASE_URL || 'https://ai.dichung.vn').replace(/\/+$/, '');
  const payUrl = `${publicBaseUrl}/pay/${encodeURIComponent(activeOrder.trackingCode)}`;

  // 1. Khách chọn thanh toán COD / Tiền mặt
  if (activeOrder.status === 'confirmed' && /^(?:cod|tiền\s*mặt|tien\s*mat|thu\s*hộ|trả\s*sau)/i.test(t)) {
    const res = await completeOrderPaymentAndDispatch({ codeOrSuffix: activeOrder.trackingCode, method: 'cod' });
    if (res.success && res.dispatchText) {
      return `Dạ em đã ghi nhận hình thức thanh toán **COD (Tiền mặt)** cho đơn ${activeOrder.trackingCode} rồi ạ!\n\n${res.dispatchText}`;
    }
  }

  // 2. Khách chọn chuyển khoản VietQR
  if (activeOrder.status === 'confirmed' && /(?:chuyển\s*khoản|vietqr|qr|ck|trả\s*trước)/i.test(t)) {
    return `Dạ anh/chị vui lòng quét mã QR hoặc chuyển khoản theo thông tin dưới đây để hoàn tất đơn **${activeOrder.trackingCode}** ạ:\n\n🏦 Ngân hàng: ${paymentBankId}\n💳 Số tài khoản: ${paymentAccountNo}\n👤 Chủ tài khoản: ${paymentAccountName}\n💰 Số tiền: ${formatVnd(activeOrder.estimatedPrice)}\n📝 Nội dung CK: ${activeOrder.trackingCode}\n\n🔗 Bấm vào đây để mở mã QR thanh toán nhanh: ${payUrl}\n\n*(Hoặc nhắn **COD** nếu anh/chị muốn thanh toán tiền mặt khi lấy/nhận hàng ạ)*`;
  }

  // 3. Khách đồng ý / Chốt đơn (khi đơn đang ở trạng thái quoted hoặc created có giá)
  if (/^(?:đồng\s*ý|chốt\s*đơn|ok\s*chốt|chốt\s*nhé|ok\s*em|lên\s*đơn\s*đi|xác\s*nhận\s*đơn)/i.test(t) && activeOrder.status !== 'confirmed') {
    activeOrder.status = 'confirmed';
    if (dbPool) {
      dbPool.query(`UPDATE shipping_orders SET status = 'confirmed' WHERE tracking_code = $1`, [activeOrder.trackingCode]).catch(() => {});
    }
    return `🎉 Dạ em đã chốt đơn **${activeOrder.trackingCode}** với giá trọn gói **${formatVnd(activeOrder.estimatedPrice)}** rồi ạ!\n\nAnh/chị vui lòng chọn hình thức thanh toán:\n1️⃣ **Chuyển khoản VietQR**: Mở link QR thanh toán nhanh tại ${payUrl}\n2️⃣ **Thanh toán COD / Tiền mặt**: Nhắn chữ **COD** để bên em lên lệnh điều tài xế qua lấy hàng ngay ạ!`;
  }

  // 4. Khách chê đắt / Thương lượng giá -> Áp dụng CTKM giảm 10% lần 1, lần 2 chuyển CSKH
  if (/(?:đắt|mắc|giá\s*cao|giảm\s*giá|bớt\s*(?:đi|chút|không)|thương\s*lượng|ưu\s*đãi)/i.test(t)) {
    if (!activeOrder.negotiationUsed) {
      const discountedPrice = Math.round((activeOrder.estimatedPrice * 0.9) / 1000) * 1000;
      activeOrder.estimatedPrice = discountedPrice;
      activeOrder.negotiationUsed = true;
      if (dbPool) {
        dbPool.query(
          `UPDATE shipping_orders SET customer_quote_vnd = $1, negotiation_used = TRUE WHERE tracking_code = $2`,
          [discountedPrice, activeOrder.trackingCode]
        ).catch(() => {});
      }
      return `Dạ bên em rất mong được phục vụ chuyến hàng này cho anh/chị. Em xin phép áp dụng **Ưu đãi giảm trực tiếp 10%** cho đơn **${activeOrder.trackingCode}**, giá trọn gói chỉ còn **${formatVnd(discountedPrice)}** ạ.\n\nAnh/chị nhắn **"Đồng ý"** hoặc **"Chốt đơn"** để em lên lệnh lấy hàng ngay cho mình nhé!`;
    } else {
      if (dceOpsUserId) {
        sendZaloOAReply(
          dceOpsUserId,
          `⚠️ [CẦN CSKH CAN THIỆP] Khách hàng đơn ${activeOrder.trackingCode} (${activeOrder.customerName || userId}) vẫn đang thương lượng thêm sau khi đã giảm 10% (${formatVnd(activeOrder.estimatedPrice)}). Vui lòng hỗ trợ trực tiếp!`
        ).catch(() => {});
      }
      return `Dạ đơn hàng **${activeOrder.trackingCode}** của mình có tính chất đặc thù, em đã chuyển thông tin tới chuyên viên điều phối (${dceOpsPhone}) để hỗ trợ mức giá tốt nhất cho anh/chị ngay đây ạ!`;
    }
  }

  return null;
}

// API Route: Chủ động gửi phiếu vận đơn sang Zalo cho khách hàng
app.post('/api/zalo/send-order-bill', async (req: Request, res: Response) => {
  const { userId, shippingInfo, trackingCode } = req.body || {};
  if (!userId || !shippingInfo) {
    return res.status(400).json({ error: 'userId and shippingInfo are required' });
  }
  const summaryText = generateShipmentTextSummary(shippingInfo, trackingCode);
  const success = await sendZaloOAReply(userId, summaryText);
  if (success) {
    await recordCrmInteraction(userId, 'bot', summaryText, shippingInfo, 'Phiếu Vận Đơn (ShipBot)');
  }
  return res.json({ success, message: summaryText });
});

// Proactive Token Refresher: Checks every 30 minutes and auto-refreshes before the 25-hour limit (at 18 hours)
setInterval(async () => {
  const token = currentZaloAccessToken || process.env.ZALO_OA_ACCESS_TOKEN || '';
  const refreshToken = currentZaloRefreshToken || process.env.ZALO_REFRESH_TOKEN || '';
  if (!token || !refreshToken) return;

  const hoursElapsed = (Date.now() - lastTokenRefreshTimestamp) / (1000 * 60 * 60);

  // Auto-refresh proactively every 18 hours (well before 25h expiration limit!)
  if (hoursElapsed >= 18) {
    console.log(`[Zalo OA] Proactive auto-refresh triggered (token age: ${hoursElapsed.toFixed(1)}h)...`);
    logZaloEvent('token_refresh', `Đang tự động gia hạn định kỳ (token age: ${hoursElapsed.toFixed(1)}h)...`);
    const newToken = await refreshZaloAccessToken();
    if (newToken) {
      lastTokenRefreshTimestamp = Date.now();
      console.log('[Zalo OA] Proactive token auto-refresh successfully executed!');
    }
  }
}, 30 * 60 * 1000);

// OAuth state cache for PKCE
const oauthStateMap = new Map<string, { codeVerifier: string; createdAt: number }>();

function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url'); // 43 url-safe chars
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

// Helper to determine exact OAuth redirect URI (ensures HTTPS on Render and production domains)
function getOAuthRedirectUri(req: Request): string {
  const forwardedHost = req.get('x-forwarded-host');
  const host = forwardedHost || req.get('host') || 'dce-shipbot.onrender.com';
  // Use http ONLY if running on localhost or 127.0.0.1
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const proto = isLocal ? 'http' : 'https';
  return `${proto}://${host}/api/zalo/oauth/callback`;
}

// API Route: 1-Click Zalo OA Authorization Login (Redirects to official Zalo permission screen)
app.get('/api/zalo/oauth/login', (req: Request, res: Response) => {
  const appId = process.env.ZALO_APP_ID || '4541345519906352744';
  const redirectUri = getOAuthRedirectUri(req);
  const state = crypto.randomBytes(16).toString('hex');
  const { codeVerifier, codeChallenge } = generatePKCE();

  oauthStateMap.set(state, { codeVerifier, createdAt: Date.now() });

  // Clean old entries (> 15 min)
  const now = Date.now();
  for (const [s, val] of oauthStateMap.entries()) {
    if (now - val.createdAt > 15 * 60 * 1000) oauthStateMap.delete(s);
  }

  const zaloAuthUrl = `https://oauth.zalo.me/v4/oa/permission?app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${codeChallenge}&state=${state}`;
  res.redirect(zaloAuthUrl);
});

// API Route: Zalo OAuth Callback handler (Auto-exchanges authorization code for Access & Refresh tokens)
app.get('/api/zalo/oauth/callback', async (req: Request, res: Response) => {
  const { code, oa_id, state } = req.query;
  const appId = process.env.ZALO_APP_ID || '4541345519906352744';
  const secretKey = process.env.ZALO_APP_SECRET || '';

  if (!code || typeof code !== 'string') {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Lỗi Ủy Quyền Zalo</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 40px; background: #f8fafc;">
          <h2 style="color: #ef4444;">Ủy quyền thất bại</h2>
          <p>Không nhận được mã xác thực (code) từ Zalo OAuth.</p>
          <a href="/" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none;">Quay lại ShipBot</a>
        </body>
      </html>
    `);
  }

  let codeVerifier: string | undefined;
  if (state && typeof state === 'string') {
    const cached = oauthStateMap.get(state);
    if (cached) {
      codeVerifier = cached.codeVerifier;
      oauthStateMap.delete(state);
    }
  }

  try {
    const bodyParams = new URLSearchParams({
      code,
      app_id: appId,
      grant_type: 'authorization_code',
    });
    if (codeVerifier) {
      bodyParams.append('code_verifier', codeVerifier);
    }

    const tokenRes = await fetch('https://oauth.zalo.me/v4/oa/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': secretKey,
      },
      body: bodyParams.toString(),
    });

    const tokenData = await tokenRes.json();
    if (tokenData?.access_token) {
      currentZaloAccessToken = tokenData.access_token;
      if (tokenData.refresh_token) {
        currentZaloRefreshToken = tokenData.refresh_token;
      }
      saveTokenCache(currentZaloAccessToken, currentZaloRefreshToken);
      lastTokenRefreshTimestamp = Date.now();
      logZaloEvent('token_update', 'Kết nối Zalo OA thành công qua 1-Click OAuth!', { oa_id });

      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Kết Nối Zalo OA Thành Công</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #1e293b;">
            <div style="background: white; padding: 36px 32px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.06); text-align: center; max-width: 440px; border: 1px solid #e2e8f0;">
              <div style="width: 64px; height: 64px; background: #ecfdf5; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 32px;">
                🎉
              </div>
              <h2 style="color: #065f46; margin: 0 0 10px 0; font-size: 22px;">Kết Nối Zalo OA Thành Công!</h2>
              <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
                ShipBot đã tự động lấy và kích hoạt <strong>Access Token</strong> mới, đồng thời lưu trữ vào Database PostgreSQL (shipbot-db). Token sẽ được hệ thống tự động gia hạn định kỳ vĩnh viễn.
              </p>
              <a href="/" style="display: inline-block; background: #2563eb; color: white; padding: 12px 28px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px; box-shadow: 0 4px 12px rgba(37,99,235,0.2);">
                Quay lại ShipBot
              </a>
            </div>
          </body>
        </html>
      `);
    } else {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"><title>Lỗi Lấy Token</title></head>
          <body style="font-family: sans-serif; text-align: center; padding: 40px; background: #f8fafc;">
            <h2 style="color: #ef4444;">Lỗi lấy Token từ Zalo</h2>
            <pre style="background: #f1f5f9; padding: 16px; border-radius: 8px; text-align: left; display: inline-block; font-size: 12px;">${JSON.stringify(tokenData, null, 2)}</pre>
            <br><br>
            <a href="/" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none;">Quay lại ShipBot</a>
          </body>
        </html>
      `);
    }
  } catch (err: any) {
    return res.status(500).send(`Lỗi hệ thống: ${err?.message}`);
  }
});

// Diagnostic API: Kiểm tra trạng thái kết nối Zalo OA, Token & Logs
app.get('/api/zalo/status', async (req: Request, res: Response) => {
  const token = currentZaloAccessToken || process.env.ZALO_OA_ACCESS_TOKEN || '';
  const refreshToken = currentZaloRefreshToken || process.env.ZALO_REFRESH_TOKEN || '';
  const appId = process.env.ZALO_APP_ID || '4541345519906352744';
  const hasSecret = Boolean(process.env.ZALO_APP_SECRET);

  let tokenValid = false;
  let zaloError: any = null;
  let zaloMessage = '';

  if (!token) {
    zaloMessage = 'Chưa cấu hình ZALO_OA_ACCESS_TOKEN';
  } else {
    try {
      const testRes = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': token,
        },
        body: JSON.stringify({
          recipient: { user_id: 'test_health_check_user' },
          message: { text: 'ping' },
        }),
      });
      const testData = await testRes.json();
      zaloError = testData?.error;
      zaloMessage = testData?.message || '';

      // -213 (User not found) or -201 (Invalid user) means Token IS VALID and accepted by Zalo!
      if (testData?.error === 0 || testData?.error === -213 || testData?.error === -201) {
        tokenValid = true;
        zaloMessage = 'Access Token hợp lệ và đang hoạt động bình thường';
      } else if (testData?.error === -216) {
        tokenValid = false;
        zaloMessage = 'Access Token đã hết hạn (-216: Access token is invalid)';
      } else if (testData?.error === -209) {
        tokenValid = false;
        zaloMessage = 'Ứng dụng chưa được duyệt hoặc thiếu quyền (-209: App has not been approved)';
      } else {
        tokenValid = false;
        zaloMessage = `Zalo trả về: [${testData?.error}] ${testData?.message}`;
      }
    } catch (err: any) {
      zaloMessage = `Không thể kết nối API Zalo: ${err?.message}`;
    }
  }

  const callbackUrl = getOAuthRedirectUri(req);

  res.json({
    connected: tokenValid,
    tokenValid,
    zaloError,
    zaloMessage,
    database: {
      connected: Boolean(dbPool),
      type: dbPool ? 'PostgreSQL (Vĩnh viễn)' : 'Chưa cấu hình DATABASE_URL (Chỉ lưu RAM)',
    },
    oauth: {
      loginUrl: '/api/zalo/oauth/login',
      callbackUrl,
    },
    config: {
      appId,
      hasAppSecret: hasSecret,
      hasAccessToken: Boolean(token),
      hasRefreshToken: Boolean(refreshToken),
      accessTokenMasked: token ? `${token.slice(0, 6)}...${token.slice(-4)}` : null,
      refreshTokenMasked: refreshToken ? `${refreshToken.slice(0, 6)}...${refreshToken.slice(-4)}` : null,
    },
    ops: {
      phone: dceOpsPhone,
      isLinked: Boolean(dceOpsUserId),
      userId: dceOpsUserId || null,
    },
    routing: {
      opsPhone: dceOpsPhone,
      opsUserId: dceOpsUserId || null,
      isOpsLinked: Boolean(dceOpsUserId),
      supplierName: defaultSupplierName,
      supplierPhone: defaultSupplierPhone,
      supplierUserId: defaultSupplierUserId || null,
      isSupplierLinked: Boolean(defaultSupplierUserId),
    },
    stats: {
      activeSessions: zaloUserSessions.size,
      serverTime: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      tokenAgeHours: parseFloat(((Date.now() - lastTokenRefreshTimestamp) / (1000 * 60 * 60)).toFixed(1)),
    },
    logs: zaloLogHistory.slice(0, 20),
  });
});

// Diagnostic API: Cập nhật Access Token / Refresh Token trực tiếp từ UI mà không cần redeploy
app.post('/api/zalo/update-token', async (req: Request, res: Response) => {
  const { accessToken, refreshToken } = req.body || {};
  if (!accessToken && !refreshToken) {
    return res.status(400).json({ error: 'Cần cung cấp accessToken hoặc refreshToken' });
  }

  if (accessToken && typeof accessToken === 'string') {
    currentZaloAccessToken = accessToken.trim();
  }
  if (refreshToken && typeof refreshToken === 'string') {
    currentZaloRefreshToken = refreshToken.trim();
  }

  saveTokenCache(currentZaloAccessToken, currentZaloRefreshToken);
  logZaloEvent('token_update', 'Đã cập nhật Token từ Web UI / API Endpoint', {
    hasAccess: Boolean(accessToken),
    hasRefresh: Boolean(refreshToken),
  });

  // Test new access token immediately
  let testResult: any = null;
  try {
    const testRes = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': currentZaloAccessToken,
      },
      body: JSON.stringify({
        recipient: { user_id: 'test_health_check_user' },
        message: { text: 'ping' },
      }),
    });
    testResult = await testRes.json();
  } catch (e: any) {
    testResult = { error: -1, message: e?.message };
  }

  const isValid = testResult?.error === 0 || testResult?.error === -213 || testResult?.error === -201;

  return res.json({
    success: true,
    tokenValid: isValid,
    testResult,
    message: isValid
      ? 'Đã lưu và kích hoạt token thành công! Bot đã sẵn sàng nhận tin nhắn.'
      : `Đã lưu token, nhưng Zalo phản hồi lỗi: [${testResult?.error}] ${testResult?.message}`,
  });
});

// Diagnostic API: Bấm nút ép thử làm mới token ngay lập tức
app.post('/api/zalo/refresh-now', async (_req: Request, res: Response) => {
  logZaloEvent('token_refresh', 'Thực hiện yêu cầu thử làm mới token từ Web UI...');
  const newToken = await refreshZaloAccessToken();
  if (newToken) {
    return res.json({
      success: true,
      message: 'Làm mới token thành công!',
      accessTokenMasked: `${newToken.slice(0, 6)}...${newToken.slice(-4)}`,
    });
  } else {
    const lastErr = zaloLogHistory.find((l) => l.type === 'error');
    return res.status(400).json({
      success: false,
      message: 'Làm mới token thất bại. Có thể Refresh Token đã hết hạn (90 ngày) hoặc đã được sử dụng trước đó.',
      details: lastErr?.details || null,
    });
  }
});

// Zalo Webhook verification (GET)
app.get('/api/zalo/webhook', (_req: Request, res: Response) => {
  res.status(200).send('ZALO_WEBHOOK_OK');
});

// Zalo Webhook events (POST): Listen to incoming customer messages & human OA interventions from Zalo OA
app.post('/api/zalo/webhook', async (req: Request, res: Response) => {
  const { event_name, user_id_by_app, sender, recipient, message } = req.body || {};
  const primaryUserId = user_id_by_app || sender?.id;
  const userText = message?.text;

  // Acknowledge Zalo immediately to prevent retries (timeout is 3s on Zalo)
  res.status(200).json({ error: 0, message: 'Received' });

  // Ghi nhận ánh xạ giữa user_id_by_app và OA user_id để đồng bộ handover
  if (event_name && String(event_name).startsWith('user_send_')) {
    linkZaloIds(user_id_by_app, sender?.id);
  } else if (event_name && String(event_name).startsWith('oa_send_')) {
    linkZaloIds(user_id_by_app, recipient?.id, (recipient as any)?.user_id);
  }

  // Log nhẹ các sự kiện không phải user_send_text (trừ user_seen_message) để tiện kiểm tra webhook OA
  if (event_name && event_name !== 'user_send_text' && !String(event_name).includes('seen')) {
    logZaloEvent('incoming_webhook', `[Webhook] ${event_name}`, {
      event_name,
      user_id_by_app,
      senderId: sender?.id,
      recipientId: recipient?.id || (recipient as any)?.user_id,
      text: userText ? String(userText).slice(0, 100) : undefined,
    });
  }

  // 1. BẮT SỰ KIỆN NHÂN VIÊN CAN THIỆP TRỰC TIẾP TRÊN ZALO OA APP (oa_send_text, oa_send_image, oa_send_file...)
  if (typeof event_name === 'string' && event_name.startsWith('oa_send_')) {
    const rawRecipientIds = Array.from(
      new Set(
        [
          recipient?.id,
          (recipient as any)?.user_id,
          user_id_by_app,
          ...getLinkedZaloIds(recipient?.id),
          ...getLinkedZaloIds((recipient as any)?.user_id),
          ...getLinkedZaloIds(user_id_by_app),
        ].filter((x): x is string => Boolean(x))
      )
    );
    // Chọn ID đang có phiên hoạt động (ưu tiên key đang lưu trong zaloUserSessions / inMemoryCustomers)
    const recipientId =
      rawRecipientIds.find((id) => zaloUserSessions.has(id) || inMemoryCustomers.has(id)) ||
      user_id_by_app ||
      recipient?.id ||
      (recipient as any)?.user_id;
    const oaMsgText = message?.text || `[Nhân viên gửi ${event_name.replace('oa_send_', '')}]`;

    if (rawRecipientIds.length > 0 && !wasRecentlySentByBot(rawRecipientIds, oaMsgText)) {
      // Hỗ trợ lệnh nhanh từ nhân viên trên OA App: "#bot" hoặc "#ai" để bật lại AI
      if (/^#(?:bot|ai)\b/i.test(oaMsgText.trim())) {
        for (const id of rawRecipientIds) {
          const sess = zaloUserSessions.get(id);
          if (sess) {
            sess.humanTakeover = false;
            sess.humanTakeoverBy = undefined;
          }
          const cust = inMemoryCustomers.get(id);
          if (cust) cust.human_takeover = false;
        }
        if (dbPool) {
          dbPool.query(`UPDATE crm_customers SET human_takeover = FALSE WHERE user_id = ANY($1::text[])`, [rawRecipientIds]).catch(() => {});
        }
        saveSessionsCache();
        logZaloEvent('token_update', `[AI Resumed] Nhân viên đã bật lại Bot AI cho khách ${recipientId}`);
        return;
      }

      // Nhân viên đã nhắn tin trực tiếp -> Mở/lấy phiên 24h & DỪNG AI + HANDOVER hoàn toàn trên mọi ID liên kết của khách
      const { session: oaSession } = ensureActiveChatSession(recipientId || rawRecipientIds[0], {
        forceHumanTakeover: true,
        humanTakeoverBy: 'Tư vấn viên (Zalo OA)',
        linkedIds: rawRecipientIds,
      });
      oaSession.humanTakeover = true;
      oaSession.humanTakeoverBy = 'Tư vấn viên (Zalo OA)';
      oaSession.humanTakeoverAt = Date.now();
      oaSession.idleFollowUpSent = true;
      oaSession.lastActive = Date.now();

      for (const id of rawRecipientIds) {
        const sess = zaloUserSessions.get(id);
        if (sess && sess !== oaSession) {
          sess.humanTakeover = true;
          sess.humanTakeoverBy = 'Tư vấn viên (Zalo OA)';
          sess.humanTakeoverAt = Date.now();
          sess.idleFollowUpSent = true;
          sess.lastActive = Date.now();
          sess.sessionId = oaSession.sessionId;
          sess.sessionStartedAt = oaSession.sessionStartedAt;
        }
        const cust = inMemoryCustomers.get(id);
        if (cust) {
          cust.human_takeover = true;
          cust.current_session_id = oaSession.sessionId;
          if (oaSession.sessionStartedAt) cust.session_started_at = new Date(oaSession.sessionStartedAt).toISOString();
        }
      }
      if (dbPool) {
        dbPool.query(
          `UPDATE crm_customers SET human_takeover = TRUE, current_session_id = $1 WHERE user_id = ANY($2::text[])`,
          [oaSession.sessionId || null, rawRecipientIds]
        ).catch(() => {});
      }

      if (recipientId) {
        await recordCrmInteraction(recipientId, 'agent', oaMsgText, oaSession?.currentInfo, 'Tư vấn viên (Zalo OA)', oaSession.sessionId);
      }
      saveSessionsCache();
      logZaloEvent('outgoing_reply', `[Human Handover - AI STOP] Nhân viên đã can thiệp trực tiếp cho khách ${recipientId} (Session ${oaSession.sessionId}): "${oaMsgText.slice(0, 60)}"`);
    }
    return;
  }

  // Dùng userId nhất quán với session đang tồn tại nếu có (giữa user_id_by_app và sender.id)
  const incomingIds = Array.from(
    new Set([user_id_by_app, sender?.id, ...getLinkedZaloIds(primaryUserId)].filter((x): x is string => Boolean(x)))
  );
  const userId =
    incomingIds.find((id) => zaloUserSessions.has(id) || inMemoryCustomers.has(id)) || primaryUserId;

  if (event_name === 'user_send_text' && userId && userText) {
    logZaloEvent('incoming_webhook', `Khách hàng ${userId} nhắn: "${userText}"`, {
      event_name,
      userId,
      userText,
      msgId: message?.msg_id,
    });
    console.log(`[Zalo OA] Incoming message from user ${userId}: ${userText}`);
    try {
      const trimmed = userText.trim();
      const isOpsCommand =
        /^(?:#ops|ops|#dceops|dce\s*ops)(?:\s+(0\d{9,10}|\+?84\d{9,10}))?$/i.test(trimmed) ||
        trimmed.toLowerCase() === '#ops' ||
        trimmed.toLowerCase() === 'ops' ||
        (dceOpsPhone && trimmed.includes(dceOpsPhone));

      if (isOpsCommand) {
        dceOpsUserId = userId;
        console.log(`[DCE Ops] Linked Zalo User ID: ${userId} to DCE Ops (${dceOpsPhone})`);

        if (dbPool) {
          dbPool.query(
            `INSERT INTO bot_settings (key, value, updated_at)
             VALUES ('dce_ops_user_id', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
            [userId]
          ).catch(() => {});

          dbPool.query(
            `UPDATE crm_customers SET name = $1, phone = $2 WHERE user_id = $3;`,
            [`DCE Ops (${dceOpsPhone})`, dceOpsPhone, userId]
          ).catch(() => {});
        }

        const reply = `✅ Đã kết nối tài khoản Zalo này với vai trò: ĐIỀU PHỐI VẬN HÀNH DCE (Hotline: ${dceOpsPhone})!\n\nTừ bây giờ, bất cứ khi nào có đơn vận chuyển mới (từ Web hoặc khách chốt qua Zalo OA), hệ thống sẽ TỰ ĐỘNG gửi thông tin báo giá chi tiết về Zalo này để bạn gửi ngay cho các Supplier/Nhà xe đối tác.\n\nCảm ơn bạn!`;

        await sendZaloOAReply(userId, reply);
        await recordCrmInteraction(userId, 'bot', reply, {}, 'Xác Nhận Kích Hoạt DCE Ops');
        logZaloEvent('token_update', `Đã liên kết Zalo user_id ${userId} cho DCE Ops (${dceOpsPhone})`);
        return;
      }

      const isSupplierCommand =
        /^(?:#supplier|supplier|#ncc)(?:\s+(0\d{9,10}|\+?84\d{9,10}))?$/i.test(trimmed) ||
        trimmed.toLowerCase() === '#supplier' ||
        (defaultSupplierPhone && trimmed.includes(defaultSupplierPhone));

      if (isSupplierCommand) {
        defaultSupplierUserId = userId;
        console.log(`[Default Supplier] Linked Zalo User ID: ${userId} to ${defaultSupplierName} (${defaultSupplierPhone})`);

        if (dbPool) {
          dbPool.query(
            `INSERT INTO bot_settings (key, value, updated_at)
             VALUES ('default_supplier_user_id', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
            [userId]
          ).catch(() => {});

          dbPool.query(
            `UPDATE crm_customers SET name = $1, phone = $2 WHERE user_id = $3;`,
            [`NCC: ${defaultSupplierName}`, defaultSupplierPhone, userId]
          ).catch(() => {});
        }

        const reply = `✅ Đã kết nối tài khoản Zalo này với vai trò: NHÀ CUNG CẤP MẶC ĐỊNH — ${defaultSupplierName} (Zalo: ${defaultSupplierPhone})!\n\nCác đơn hàng ngoại lệ chưa có trong bảng giá chuẩn sẽ được tự động gửi tới tài khoản này để báo giá nhanh.\n\nCảm ơn Quý đối tác!`;

        await sendZaloOAReply(userId, reply);
        await recordCrmInteraction(userId, 'bot', reply, {}, 'Xác Nhận Kích Hoạt Nhà Cung Cấp Mặc Định');
        logZaloEvent('token_update', `Đã liên kết Zalo user_id ${userId} cho Nhà cung cấp ${defaultSupplierName} (${defaultSupplierPhone})`);
        return;
      }

      // Cú pháp phản hồi báo giá trực tiếp trên Zalo của Ops / Supplier: #baogia <MÃ_ĐƠN> <GIÁ> [ghi chú]
      const baogiaMatch = trimmed.match(/^(?:#baogia|baogia|#bg)\s+([A-Za-z0-9-]+)\s+([^\s]+)(?:\s+(.+))?$/i);
      if (baogiaMatch) {
        const codePart = baogiaMatch[1];
        const pricePart = baogiaMatch[2];
        const notePart = baogiaMatch[3]?.trim();
        const parsedAmount = parseVietnameseMoney(pricePart);
        const quotedByLabel =
          userId === defaultSupplierUserId
            ? `${defaultSupplierName} (${defaultSupplierPhone})`
            : userId === dceOpsUserId
            ? `DCE Ops (${dceOpsPhone})`
            : `Zalo (${userId.slice(-4)})`;

        const qRes = await applyOrderQuote({
          codeOrSuffix: codePart,
          inputAmountVnd: parsedAmount,
          applyMargin: true,
          quotedBy: quotedByLabel,
          quoteNote: notePart,
        });

        if (qRes.success && qRes.order) {
          const replyText = `✅ Đã ghi nhận báo giá cho đơn ${qRes.order.trackingCode}!\n- Giá gốc nhập: ${formatVnd(qRes.baseCostVnd || 0)}\n- Giá báo Khách (+30%): ${formatVnd(qRes.customerQuoteVnd || 0)}${qRes.customerNotified ? '\n📲 Đã tự động gửi báo giá tới Zalo khách hàng!' : ''}`;
          await sendZaloOAReply(userId, replyText);
        } else {
          await sendZaloOAReply(userId, `❌ Không thể cập nhật báo giá: ${qRes.error || 'Lỗi không xác định'}\nVí dụ đúng: #baogia VN-LOG-1611-8191 450000`);
        }
        return;
      }

      const isResetOrder = /^(?:tạo\s*đơn\s*mới|đơn\s*mới|hủy\s*đơn|làm\s*lại|reset)\b/i.test(trimmed);

      const { session, isNewSession } = ensureActiveChatSession(userId, { linkedIds: incomingIds });

      let wasHumanTakeover = !isNewSession && incomingIds.some(
        (id) => Boolean(zaloUserSessions.get(id)?.humanTakeover || inMemoryCustomers.get(id)?.human_takeover)
      );
      if (!isNewSession && session.humanTakeover) {
        wasHumanTakeover = true;
      }

      // Dự phòng kiểm tra trong DB CHỈ trong cùng phiên 24h cố định (hết 24h là phiên mới -> AI tự bật lại)
      if (!isNewSession && !wasHumanTakeover && dbPool && incomingIds.length > 0) {
        try {
          const dbChk = await dbPool.query(
            `SELECT human_takeover FROM crm_customers
             WHERE user_id = ANY($1::text[])
               AND human_takeover = TRUE
               AND (session_started_at IS NULL OR NOW() - session_started_at < INTERVAL '24 hours')
             LIMIT 1`,
            [incomingIds]
          );
          if (dbChk.rows.length > 0) {
            wasHumanTakeover = true;
          }
        } catch {}
      }

      session.lastActive = Date.now();
      session.lastCustomerMessageAt = Date.now();
      session.idleFollowUpSent = false;

      // Record incoming customer message in CRM (gắn Session ID 24h)
      await recordCrmInteraction(userId, 'user', userText, session.currentInfo, undefined, session.sessionId);

      // QUY TẮC 1: Trong phiên 24h, khi nhân viên người thật đã can thiệp -> AI DỪNG HOÀN TOÀN (Handover)
      if (wasHumanTakeover || session.humanTakeover) {
        session.humanTakeover = true;
        saveSessionsCache();
        console.log(`[Human Handover] AI đã dừng cho khách ${userId} (Session ${session.sessionId}, aliases: ${incomingIds.join(',')}), bỏ qua trả lời tự động.`);
        return;
      }

      // QUY TẮC 4: Khách gõ "tạo đơn mới" trong vòng 24h -> GIỮ NGUYÊN sessionId & sessionStartedAt, chỉ reset dữ liệu đơn
      if (isResetOrder) {
        const resetReply = 'Dạ em đã tạo phiên đơn mới rồi ạ. Bên em chuyên dịch vụ vận chuyển hỏa tốc, giao nhận tận nơi. Anh/chị cho em xin địa chỉ lấy và giao hàng nhé!';
        session.currentInfo = {};
        session.history = [
          { role: 'user', content: userText },
          { role: 'model', content: resetReply },
        ];
        session.lastBotMessageAt = Date.now();
        saveSessionsCache();
        await sendZaloOAReply(userId, resetReply);
        await recordCrmInteraction(userId, 'bot', resetReply, session.currentInfo, undefined, session.sessionId);
        return;
      }

      // Kiểm tra xem khách hàng có đang chốt đơn, thương lượng giảm 10% hay chọn hình thức thanh toán (VietQR / COD) không
      const closingReply = await handleCustomerClosingWorkflow(userId, userText);
      if (closingReply) {
        session.history.push({ role: 'user', content: userText });
        session.history.push({ role: 'model', content: closingReply });
        session.lastActive = Date.now();
        session.lastBotMessageAt = Date.now();
        saveSessionsCache();
        await sendZaloOAReply(userId, closingReply);
        await recordCrmInteraction(userId, 'bot', closingReply, session.currentInfo, undefined, session.sessionId);
        return;
      }

      // Run EXACT same intelligence pipeline as Web UI with full history and currentInfo!
      const result = await processChatPipeline(userText, session.history, session.currentInfo);

      // Update session state
      session.history.push({ role: 'user', content: userText });
      session.history.push({ role: 'model', content: result.reply });
      session.currentInfo = result.shippingInfo;
      session.lastActive = Date.now();
      session.lastBotMessageAt = Date.now();

      // Trim history if too long to keep context compact
      if (session.history.length > 16) {
        session.history = session.history.slice(-10);
      }

      saveSessionsCache();
      await sendZaloOAReply(userId, result.reply);
      // Record outgoing bot response in CRM (gắn Session ID 24h)
      await recordCrmInteraction(userId, 'bot', result.reply, result.shippingInfo, undefined, session.sessionId);
    } catch (err: any) {
      logZaloEvent('error', `Lỗi xử lý tin nhắn của user ${userId}: ${err?.message}`);
      console.error('[Zalo OA] Error processing chat reply:', err?.message);
    }
  }
});

// QUY TẮC 3: Nếu sau ~5 phút không thấy khách phản ứng -> Tự động nhắn xin SĐT để tư vấn trực tiếp
setInterval(async () => {
  const now = Date.now();
  const IDLE_MS = 5 * 60 * 1000;
  const MAX_AGE_MS = 30 * 60 * 1000;

  for (const [uid, sess] of zaloUserSessions.entries()) {
    if (uid === dceOpsUserId || uid === defaultSupplierUserId) continue;
    if (isSessionExpired24h(sess, now)) continue;
    if (sess.humanTakeover || sess.idleFollowUpSent || sess.currentInfo?.isComplete) continue;
    if (!sess.history || sess.history.length === 0) continue;

    const lastMsg = sess.history[sess.history.length - 1];
    if (lastMsg.role !== 'model') continue;

    const refTime = sess.lastBotMessageAt || sess.lastActive;
    const elapsed = now - refTime;
    if (elapsed >= IDLE_MS && elapsed <= MAX_AGE_MS) {
      sess.idleFollowUpSent = true;
      const cust = inMemoryCustomers.get(uid);
      const knownPhone = sess.currentInfo?.sender?.phone || cust?.phone || '';
      const followUpText = isValidVNPhone(knownPhone)
        ? `Anh/chị ơi, khi nào tiện anh/chị nhắn thêm thông tin giúp em nhé, hoặc bên em sẽ liên hệ qua số ${knownPhone} để tư vấn trực tiếp cho mình ạ!`
        : 'Anh/chị ơi, nếu mình đang bận chưa tiện nhắn tin, anh/chị cho em xin số điện thoại để bên em liên hệ lại tư vấn và báo giá trực tiếp nhé!';

      sess.history.push({ role: 'model', content: followUpText });
      sess.lastBotMessageAt = now;
      saveSessionsCache();

      const sent = await sendZaloOAReply(uid, followUpText);
      if (sent) {
        await recordCrmInteraction(uid, 'bot', followUpText, sess.currentInfo, 'ShipBot (Nhắc sau 5 phút)', sess.sessionId);
        logZaloEvent('outgoing_reply', `Đã gửi tin nhắn xin SĐT sau 5 phút không phản hồi tới ${uid} (Session ${sess.sessionId || 'N/A'})`);
      }
    }
  }
}, 30 * 1000);

// --- CRM REST API ENDPOINTS ---

// GET /api/crm/customers - Lấy danh sách khách hàng Zalo OA
app.get('/api/crm/customers', async (req: Request, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  if (dbPool) {
    try {
      let query = `SELECT * FROM crm_customers`;
      const params: any[] = [];
      if (search) {
        query += ` WHERE LOWER(name) LIKE $1 OR phone LIKE $1 OR LOWER(last_message) LIKE $1 OR user_id LIKE $1`;
        params.push(`%${search}%`);
      }
      query += ` ORDER BY last_interaction DESC LIMIT 100`;
      const result = await dbPool.query(query, params);
      return res.json(result.rows);
    } catch (e: any) {
      console.error('[CRM API] Error querying customers from DB:', e?.message);
    }
  }

  // Fallback to in-memory customers
  let list = Array.from(inMemoryCustomers.values());
  if (search) {
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(search) ||
        c.phone.includes(search) ||
        c.last_message.toLowerCase().includes(search) ||
        c.user_id.includes(search)
    );
  }
  list.sort((a, b) => new Date(b.last_interaction).getTime() - new Date(a.last_interaction).getTime());
  return res.json(list);
});

// GET /api/crm/customers/:userId/messages - Lấy toàn bộ lịch sử tin nhắn (hoặc lọc theo sessionId)
app.get('/api/crm/customers/:userId/messages', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';

  if (dbPool) {
    try {
      const result = sessionId
        ? await dbPool.query(
            `SELECT * FROM crm_messages WHERE user_id = $1 AND session_id = $2 ORDER BY created_at ASC LIMIT 500`,
            [userId, sessionId]
          )
        : await dbPool.query(
            `SELECT * FROM crm_messages WHERE user_id = $1 ORDER BY created_at ASC LIMIT 500`,
            [userId]
          );
      return res.json(result.rows);
    } catch (e: any) {
      console.error('[CRM API] Error querying messages from DB:', e?.message);
    }
  }

  // Fallback to in-memory messages
  let list = inMemoryMessages.filter((m) => m.user_id === userId);
  if (sessionId) {
    list = list.filter((m) => m.session_id === sessionId);
  }
  return res.json(list);
});

// POST /api/crm/customers/:userId/send - Nhân viên tư vấn nhắn tin trực tiếp tới khách qua Zalo OA -> Dừng AI (Handover)
app.post('/api/crm/customers/:userId/send', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { text, agentName } = req.body || {};

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Nội dung tin nhắn không được để trống' });
  }

  const success = await sendZaloOAReply(userId, text.trim());

  if (success) {
    const { session } = ensureActiveChatSession(userId, {
      forceHumanTakeover: true,
      humanTakeoverBy: agentName || 'Tư vấn viên (Web)',
    });
    session.humanTakeover = true;
    session.humanTakeoverBy = agentName || 'Tư vấn viên (Web)';
    session.humanTakeoverAt = Date.now();
    session.idleFollowUpSent = true;
    session.lastActive = Date.now();
    session.history.push({ role: 'model', content: text.trim() });
    saveSessionsCache();

    const linkedIds = getLinkedZaloIds(userId);
    for (const id of linkedIds) {
      const cust = inMemoryCustomers.get(id);
      if (cust) {
        cust.human_takeover = true;
        cust.current_session_id = session.sessionId;
      }
    }
    if (dbPool) {
      dbPool.query(
        `UPDATE crm_customers SET human_takeover = TRUE, current_session_id = $1 WHERE user_id = ANY($2::text[])`,
        [session.sessionId || null, linkedIds]
      ).catch(() => {});
    }

    await recordCrmInteraction(
      userId,
      'agent',
      text.trim(),
      session?.currentInfo,
      agentName || 'Tư vấn viên (Web)',
      session.sessionId
    );

    return res.json({ success: true, humanTakeover: true, sessionId: session.sessionId, message: 'Đã gửi tin nhắn và tạm dừng AI để tư vấn viên tiếp quản!' });
  } else {
    return res.status(500).json({ success: false, error: 'Không thể gửi tin nhắn qua Zalo OA. Kiểm tra Access Token!' });
  }
});

// POST /api/crm/customers/:userId/ai-toggle - Bật / Tắt AI cho từng khách hàng (Human Handover control)
app.post('/api/crm/customers/:userId/ai-toggle', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { humanTakeover } = req.body || {};
  const paused = Boolean(humanTakeover);

  const { session } = ensureActiveChatSession(userId);
  session.humanTakeover = paused;
  session.humanTakeoverAt = paused ? Date.now() : undefined;
  saveSessionsCache();

  const linkedIds = getLinkedZaloIds(userId);
  for (const id of linkedIds) {
    const cust = inMemoryCustomers.get(id);
    if (cust) cust.human_takeover = paused;
  }
  if (dbPool) {
    dbPool.query(`UPDATE crm_customers SET human_takeover = $1 WHERE user_id = ANY($2::text[])`, [paused, linkedIds]).catch(() => {});
  }

  logZaloEvent('token_update', `[CRM] ${paused ? 'Đã tạm dừng AI (Handover)' : 'Đã bật lại Bot AI'} cho khách ${userId} (Session ${session.sessionId})`);
  return res.json({ success: true, userId, sessionId: session.sessionId, humanTakeover: paused });
});

// PUT /api/crm/customers/:userId - Cập nhật thông tin khách hàng (Tên, SĐT, Địa chỉ)
app.put('/api/crm/customers/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { name, phone, address } = req.body || {};

  const customer = inMemoryCustomers.get(userId);
  if (customer) {
    if (name) customer.name = name;
    if (phone) customer.phone = phone;
    if (address) customer.address = address;
  }

  if (dbPool) {
    try {
      await dbPool.query(
        `UPDATE crm_customers SET name = COALESCE($1, name), phone = COALESCE($2, phone), address = COALESCE($3, address) WHERE user_id = $4`,
        [name || null, phone || null, address || null, userId]
      );
    } catch (e: any) {
      console.error('[CRM API] Error updating customer:', e?.message);
    }
  }

  return res.json({ success: true, customer });
});

// --- SHIPPING ORDERS REST API ENDPOINTS (Lưu trữ và đồng bộ trong shipbot-db) ---

// GET /api/orders - Lấy danh sách phiếu vận đơn đã lưu từ Database
app.get('/api/orders', async (_req: Request, res: Response) => {
  if (dbPool) {
    try {
      const result = await dbPool.query(`
        SELECT id, tracking_code, created_at, status, customer_name, customer_phone, zalo_user_id, base_cost_vnd, customer_quote_vnd, quoted_by, quoted_at, quote_note, payment_method, payment_status, paid_at, payment_ref, negotiation_used, source, shipping_info
        FROM shipping_orders
        ORDER BY created_at DESC
        LIMIT 100
      `);
      const orders = result.rows.map((r) => ({
        id: r.id,
        trackingCode: r.tracking_code,
        createdAt: r.created_at ? new Date(r.created_at).toLocaleString('vi-VN') : '',
        status: r.status,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        zaloUserId: r.zalo_user_id || undefined,
        baseCostVnd: r.base_cost_vnd != null ? Number(r.base_cost_vnd) : undefined,
        estimatedPrice: r.customer_quote_vnd != null ? Number(r.customer_quote_vnd) : undefined,
        quotedBy: r.quoted_by || undefined,
        quotedAt: r.quoted_at ? new Date(r.quoted_at).toISOString() : undefined,
        quoteNote: r.quote_note || undefined,
        paymentMethod: r.payment_method || undefined,
        paymentStatus: r.payment_status || 'unpaid',
        paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : undefined,
        paymentRef: r.payment_ref || undefined,
        negotiationUsed: Boolean(r.negotiation_used),
        source: r.source,
        shippingInfo: r.shipping_info,
      }));
      return res.json({ success: true, orders, source: 'postgresql' });
    } catch (err: any) {
      console.error('[API /api/orders] Error fetching orders from DB:', err?.message);
    }
  }
  return res.json({ success: true, orders: inMemoryOrders, source: 'memory' });
});

// POST /api/orders/:trackingCode/quote - Lưu báo giá từ Ops / Supplier cho đơn ngoại lệ
app.post('/api/orders/:trackingCode/quote', async (req: Request, res: Response) => {
  try {
    const { trackingCode } = req.params;
    const { baseCostVnd, applyMargin, quotedBy, quoteNote } = req.body || {};
    const parsedAmount = typeof baseCostVnd === 'number' ? baseCostVnd : parseVietnameseMoney(String(baseCostVnd || ''));
    const result = await applyOrderQuote({
      codeOrSuffix: trackingCode,
      inputAmountVnd: parsedAmount,
      applyMargin: applyMargin !== false,
      quotedBy: quotedBy || `DCE Ops (${dceOpsPhone})`,
      quoteNote,
    });
    if (!result.success) {
      return res.status(404).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// GET /api/config/payment - Lấy cấu hình Ngân hàng VietQR
app.get('/api/config/payment', (_req: Request, res: Response) => {
  return res.json({
    bankId: paymentBankId,
    accountNo: paymentAccountNo,
    accountName: paymentAccountName,
  });
});

// POST /api/config/payment - Cập nhật cấu hình Ngân hàng VietQR từ Web UI
app.post('/api/config/payment', async (req: Request, res: Response) => {
  const { bankId, accountNo, accountName } = req.body || {};
  if (typeof bankId === 'string' && bankId.trim()) paymentBankId = bankId.trim().toUpperCase();
  if (typeof accountNo === 'string' && accountNo.trim()) paymentAccountNo = accountNo.trim();
  if (typeof accountName === 'string' && accountName.trim()) paymentAccountName = accountName.trim().toUpperCase();

  if (dbPool) {
    try {
      const pairs: Array<[string, string]> = [
        ['payment_bank_id', paymentBankId],
        ['payment_account_no', paymentAccountNo],
        ['payment_account_name', paymentAccountName],
      ];
      for (const [k, v] of pairs) {
        await dbPool.query(
          `INSERT INTO bot_settings (key, value, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
          [k, v]
        );
      }
    } catch (e: any) {
      console.error('[API /api/config/payment] DB save error:', e?.message);
    }
  }

  return res.json({
    success: true,
    bankId: paymentBankId,
    accountNo: paymentAccountNo,
    accountName: paymentAccountName,
    message: 'Đã lưu cấu hình tài khoản ngân hàng VietQR thành công!',
  });
});

// POST /api/orders/:trackingCode/payment - Xác nhận thanh toán (VietQR / COD) & Phát hành Lệnh Điều Phối
app.post('/api/orders/:trackingCode/payment', async (req: Request, res: Response) => {
  try {
    const { trackingCode } = req.params;
    const { method, paymentRef } = req.body || {};
    const resolvedMethod = method === 'cod' ? 'cod' : 'vietqr';
    const result = await completeOrderPaymentAndDispatch({
      codeOrSuffix: trackingCode,
      method: resolvedMethod,
      paymentRef,
    });
    if (!result.success) {
      return res.status(404).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// POST /api/payment/vietqr-webhook - Webhook đối soát tự động từ SePAY / Casso / Ngân hàng
app.post('/api/payment/vietqr-webhook', async (req: Request, res: Response) => {
  try {
    if (PAYMENT_WEBHOOK_SECRET) {
      const incomingSecret = req.headers['x-api-key'] || req.headers['authorization'] || req.query.secret;
      if (String(incomingSecret || '').replace(/^Bearer\s+/i, '') !== PAYMENT_WEBHOOK_SECRET) {
        return res.status(401).json({ success: false, error: 'Invalid webhook secret' });
      }
    }

    const body = req.body || {};
    // Hỗ trợ chuẩn payload của SePAY (content, transferAmount, referenceCode) hoặc Casso (data[].description, amount)
    const txList = Array.isArray(body.data) ? body.data : [body];
    const processed: string[] = [];

    for (const tx of txList) {
      const content = String(tx.content || tx.description || tx.remark || '').toUpperCase();
      const refCode = String(tx.referenceCode || tx.id || tx.tid || `BANK-${Date.now().toString().slice(-6)}`);
      const codeMatch = content.match(/VN-LOG-\d{4}-\d{4}/i) || content.match(/VNLOG\d{8}/i);
      if (codeMatch) {
        let code = codeMatch[0].toUpperCase();
        if (code.startsWith('VNLOG')) {
          code = `VN-LOG-${code.slice(5, 9)}-${code.slice(9, 13)}`;
        }
        const dispatchRes = await completeOrderPaymentAndDispatch({
          codeOrSuffix: code,
          method: 'vietqr',
          paymentRef: refCode,
        });
        if (dispatchRes.success) {
          processed.push(code);
        }
      }
    }

    return res.json({ success: true, processed });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// GET /pay/:trackingCode - Trang Thanh toán VietQR Động & Chốt COD tối ưu cho Mobile
app.get('/pay/:trackingCode', async (req: Request, res: Response) => {
  const { trackingCode } = req.params;
  const order = await findOrderByTrackingCodeOrSuffix(trackingCode);
  if (!order) {
    return res.status(404).send(`
      <!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Không tìm thấy đơn</title></head>
      <body style="font-family:sans-serif;padding:32px;text-align:center;background:#f8fafc;">
        <h2>❌ Không tìm thấy đơn hàng ${trackingCode}</h2>
      </body></html>
    `);
  }

  const amount = order.estimatedPrice || 0;
  const qrUrl = buildVietQrUrl(amount, order.trackingCode);
  const sAddr = order.shippingInfo?.sender?.address || '(Chưa có)';
  const rAddr = order.shippingInfo?.receiver?.address || '(Chưa có)';
  const sContact = [order.shippingInfo?.sender?.name || order.customerName, order.shippingInfo?.sender?.phone || order.customerPhone].filter(Boolean).join(' - ') || '(Chưa có)';
  const cargo = order.shippingInfo?.cargo?.name || 'Hàng hóa';
  const isAlreadyDone = order.status === 'dispatched' || order.paymentStatus === 'paid' || order.paymentStatus === 'cod_pending';

  return res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Thanh Toán Đơn ${order.trackingCode} | Đi Chung Express</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f1f5f9; margin: 0; padding: 16px; color: #0f172a; }
        .card { max-width: 460px; margin: 0 auto; background: #fff; border-radius: 18px; box-shadow: 0 12px 30px rgba(15,23,42,0.08); overflow: hidden; border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #059669, #0d9488); color: #fff; padding: 20px; text-align: center; }
        .body { padding: 20px; }
        .amount { font-size: 28px; font-weight: 900; color: #059669; text-align: center; margin: 6px 0 14px; }
        .qr-box { text-align: center; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 14px; padding: 14px; margin-bottom: 16px; }
        .qr-box img { max-width: 240px; width: 100%; border-radius: 10px; }
        .info { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; font-size: 13px; line-height: 1.6; margin-bottom: 16px; }
        .btn { width: 100%; border: none; padding: 13px; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; margin-bottom: 8px; }
        .btn-primary { background: #059669; color: #fff; }
        .btn-cod { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
        .status-done { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; padding: 14px; border-radius: 12px; text-align: center; font-weight: 700; margin-bottom: 14px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.5px;opacity:0.9;">ĐI CHUNG EXPRESS — THANH TOÁN ĐƠN HÀNG</div>
          <h2 style="margin:6px 0 0;font-size:20px;">${order.trackingCode}</h2>
        </div>
        <div class="body">
          ${isAlreadyDone ? `<div class="status-done">${order.paymentStatus === 'paid' ? '✅ ĐÃ THANH TOÁN VIETQR & PHÁT LỆNH LẤY HÀNG' : '✅ ĐÃ CHỐT THANH TOÁN COD & PHÁT LỆNH LẤY HÀNG'}</div>` : ''}
          <div style="text-align:center;font-size:12px;color:#64748b;">Tổng cước thanh toán</div>
          <div class="amount">${amount > 0 ? formatVnd(amount) : 'Chờ báo giá'}</div>

          ${amount > 0 ? `
          <div class="qr-box">
            <img src="${qrUrl}" alt="VietQR ${order.trackingCode}" />
            <div style="font-size:12px;color:#334155;margin-top:8px;">
              <strong>${paymentBankId}</strong> • STK: <strong>${paymentAccountNo}</strong><br/>
              Chủ TK: <strong>${paymentAccountName}</strong><br/>
              Nội dung CK: <strong style="color:#059669;">${order.trackingCode}</strong>
            </div>
          </div>` : ''}

          <div class="info">
            <div><strong>👤 Người gửi/lấy:</strong> ${sContact}</div>
            <div><strong>📍 Lấy tại:</strong> ${sAddr}</div>
            <div><strong>🎯 Giao đến:</strong> ${rAddr}</div>
            <div><strong>📦 Hàng hóa:</strong> ${cargo}</div>
            <div><strong>⏰ Thời gian:</strong> ${order.shippingInfo?.deliveryTime || 'Theo thỏa thuận'}</div>
          </div>

          <button class="btn btn-primary" onclick="confirmPayment('vietqr')">✅ Tôi đã chuyển khoản xong (Xác nhận & Lên lệnh)</button>
          <button class="btn btn-cod" onclick="confirmPayment('cod')">💵 Chọn Thanh toán COD / Tiền mặt khi giao nhận</button>
          <div id="payMsg" style="margin-top:10px;font-size:13px;text-align:center;"></div>
        </div>
      </div>

      <script>
        async function confirmPayment(method) {
          const msg = document.getElementById('payMsg');
          msg.textContent = 'Đang xử lý và phát lệnh điều phối...';
          try {
            const res = await fetch('/api/orders/${encodeURIComponent(order.trackingCode)}/payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ method })
            });
            const data = await res.json();
            if (data.success) {
              msg.innerHTML = '<div style="color:#059669;font-weight:700;padding:10px;background:#ecfdf5;border-radius:10px;">🎉 Thành công! Đã phát hành Lệnh Điều Phối tới Khách hàng, DCE Ops & Nhà xe!</div>';
              setTimeout(() => location.reload(), 1200);
            } else {
              msg.textContent = '❌ Lỗi: ' + (data.error || 'Không thể xử lý');
            }
          } catch (e) {
            msg.textContent = '❌ Lỗi kết nối máy chủ';
          }
        }
      </script>
    </body>
    </html>
  `);
});

// --- ASTERISK VOIP & ZALO ZNS INTEGRATION (GIAI ĐOẠN 4) ---

const recentAsteriskCallTimestamps = new Map<string, number>();

function normalizeVietnamPhone(raw: string): { local0: string; intl84: string; tail9: string } {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 11) {
    digits = '0' + digits.slice(2);
  } else if (digits.length === 9 && /^[35789]/.test(digits)) {
    digits = '0' + digits;
  }
  const tail9 = digits.slice(-9);
  const intl84 = digits.startsWith('0') ? '84' + digits.slice(1) : digits;
  return { local0: digits, intl84, tail9 };
}

async function sendZaloZnsGreeting(intl84Phone: string, callId: string): Promise<{ success: boolean; error?: string }> {
  const token = currentZaloAccessToken || process.env.ZALO_OA_ACCESS_TOKEN || '';
  if (!token || !zaloZnsTemplateId) {
    return { success: false, error: 'Chưa cấu hình ZALO_ZNS_TEMPLATE_ID hoặc Access Token' };
  }
  try {
    const res = await fetch('https://business.openapi.zalo.me/message/template', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: token,
      },
      body: JSON.stringify({
        phone: intl84Phone,
        template_id: zaloZnsTemplateId,
        template_data: {
          customer_name: 'Quý khách',
          phone: intl84Phone,
          call_id: callId,
        },
        tracking_id: callId,
      }),
    });
    const data = await res.json();
    if (data?.error === 0) {
      return { success: true };
    }
    return { success: false, error: `[${data?.error}] ${data?.message || JSON.stringify(data)}` };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

// POST /api/asterisk/incoming-call - Nhận sự kiện cuộc gọi đến từ Tổng đài Asterisk (IVR chào -> Cúp máy -> Kích hoạt Zalo OA)
app.post('/api/asterisk/incoming-call', async (req: Request, res: Response) => {
  try {
    if (ASTERISK_WEBHOOK_SECRET) {
      const secret = req.headers['x-api-key'] || req.headers['authorization'] || req.query.secret;
      if (String(secret || '').replace(/^Bearer\s+/i, '') !== ASTERISK_WEBHOOK_SECRET) {
        return res.status(401).json({ success: false, error: 'Invalid Asterisk webhook secret' });
      }
    }

    const body = req.body || {};
    const rawPhone = String(body.callerPhone || body.caller_id || body.callerId || body.phone || body.from || '').trim();
    const uniqueId = String(body.uniqueId || body.unique_id || body.callId || `ast-${Date.now()}`).trim();

    if (!rawPhone) {
      return res.status(400).json({ success: false, error: 'callerPhone / caller_id is required' });
    }

    const { local0, intl84, tail9 } = normalizeVietnamPhone(rawPhone);
    const nowMs = Date.now();
    const lastCallMs = recentAsteriskCallTimestamps.get(local0) || 0;

    // Chống spam trùng lặp nếu khách gọi nhiều lần trong vòng 5 phút
    if (nowMs - lastCallMs < 5 * 60 * 1000) {
      const dedupLog: AsteriskCallLog = {
        id: `call-${nowMs}`,
        callerPhone: rawPhone,
        normalizedPhone: local0,
        uniqueId,
        channelUsed: 'deduplicated',
        status: 'ignored_duplicate_5m',
        createdAt: new Date().toLocaleString('vi-VN'),
      };
      inMemoryCallLogs.unshift(dedupLog);
      return res.json({ success: true, deduplicated: true, call: dedupLog });
    }
    recentAsteriskCallTimestamps.set(local0, nowMs);

    // Tìm xem SĐT này đã từng tương tác Zalo OA chưa
    let matchedUserId: string | undefined;
    for (const [uid, cust] of inMemoryCustomers.entries()) {
      if (cust.phone && cust.phone.replace(/\D/g, '').endsWith(tail9)) {
        matchedUserId = uid;
        break;
      }
    }
    if (!matchedUserId && dbPool && tail9.length >= 9) {
      try {
        const q = await dbPool.query(
          `SELECT user_id FROM crm_customers WHERE phone LIKE $1 ORDER BY last_interaction DESC LIMIT 1`,
          [`%${tail9}%`]
        );
        if (q.rows.length > 0) matchedUserId = q.rows[0].user_id;
      } catch (_) {}
    }

    let channelUsed: AsteriskCallLog['channelUsed'] = 'pending_zns';
    let status = 'pending_zns';

    if (matchedUserId) {
      // Khách đã từng tương tác OA -> Mở Session mới (nếu chưa có hoặc > 24h) & gửi tin chào từ Bot
      const greetingText = `Chào anh/chị! Đi Chung Express vừa nhận được cuộc gọi từ số ${local0} tới tổng đài.\n\nBên em chuyên về dịch vụ vận chuyển hỏa tốc, giao nhận tận nơi. Anh/chị vui lòng gửi em xin thông tin địa chỉ lấy hàng, địa chỉ giao hàng và thông tin hàng hóa để bên em tính cước báo giá nhanh nhất nhé ạ!`;

      const sessionInfo = {
        sender: { phone: local0 },
      };
      const { session: callSession, isNewSession } = ensureActiveChatSession(matchedUserId, { initialInfo: sessionInfo });
      if (!callSession.humanTakeover) {
        if (isNewSession || !callSession.currentInfo?.sender?.phone) {
          callSession.currentInfo = { ...(callSession.currentInfo || {}), sender: { ...(callSession.currentInfo?.sender || {}), phone: local0 } };
        }
        callSession.history.push({ role: 'model', content: greetingText });
        callSession.lastActive = nowMs;
        callSession.lastBotMessageAt = nowMs;
        saveSessionsCache();

        const sent = await sendZaloOAReply(matchedUserId, greetingText);
        if (sent) {
          channelUsed = 'zalo_oa_cs';
          status = 'sent_greeting_oa';
          await recordCrmInteraction(matchedUserId, 'bot', greetingText, callSession.currentInfo, 'Chào Từ Tổng Đài Asterisk', callSession.sessionId);
        } else {
          status = 'oa_send_failed';
        }
      } else {
        channelUsed = 'zalo_oa_cs';
        status = 'skipped_human_takeover_active';
      }
    } else if (zaloZnsTemplateId) {
      // Khách mới hoàn toàn -> Gửi ZNS Template chào hỏi có nút CTA Nhắn tin ngay
      const znsRes = await sendZaloZnsGreeting(intl84, uniqueId);
      if (znsRes.success) {
        channelUsed = 'zalo_zns';
        status = 'sent_zns_template';
      } else {
        channelUsed = 'pending_zns';
        status = `zns_error: ${znsRes.error || 'unknown'}`;
      }
    } else {
      // Chưa có ZNS Template -> Nhắc DCE Ops chủ động liên hệ qua Zalo
      if (dceOpsUserId) {
        sendZaloOAReply(
          dceOpsUserId,
          `📞 [CUỘC GỌI TỔNG ĐÀI ASTERISK MỚI]\n- SĐT khách gọi: ${local0}\n- Khách chưa từng nhắn Zalo OA & chưa cấu hình ZNS Template.\n👉 Bấm mở Zalo khách ngay: https://zalo.me/${local0}`
        ).catch(() => {});
      }
    }

    const callLog: AsteriskCallLog = {
      id: `call-${nowMs}`,
      callerPhone: rawPhone,
      normalizedPhone: local0,
      uniqueId,
      zaloUserId: matchedUserId,
      channelUsed,
      status,
      createdAt: new Date().toLocaleString('vi-VN'),
    };
    inMemoryCallLogs.unshift(callLog);
    if (inMemoryCallLogs.length > 50) inMemoryCallLogs.length = 50;

    if (dbPool) {
      dbPool.query(
        `INSERT INTO asterisk_call_logs (id, caller_phone, normalized_phone, unique_id, zalo_user_id, channel_used, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [callLog.id, callLog.callerPhone, callLog.normalizedPhone, callLog.uniqueId || null, callLog.zaloUserId || null, callLog.channelUsed, callLog.status]
      ).catch(() => {});
    }

    logZaloEvent('incoming_webhook', `Cuộc gọi Asterisk từ ${local0} -> ${channelUsed} (${status})`, callLog);

    return res.json({ success: true, call: callLog });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// GET /api/asterisk/calls - Danh sách cuộc gọi từ Tổng đài Asterisk
app.get('/api/asterisk/calls', async (_req: Request, res: Response) => {
  return res.json({ success: true, calls: inMemoryCallLogs });
});

// GET /api/config/asterisk & POST /api/config/asterisk - Cấu hình ZNS Template ID cho Asterisk
app.get('/api/config/asterisk', (req: Request, res: Response) => {
  const host = req.get('host') || 'ai.dichung.vn';
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  return res.json({
    webhookUrl: `${proto}://${host}/api/asterisk/incoming-call`,
    zaloZnsTemplateId,
    hasWebhookSecret: Boolean(ASTERISK_WEBHOOK_SECRET),
  });
});

app.post('/api/config/asterisk', async (req: Request, res: Response) => {
  const { zaloZnsTemplateId: tplId } = req.body || {};
  if (typeof tplId === 'string') {
    zaloZnsTemplateId = tplId.trim();
    if (dbPool) {
      await dbPool.query(
        `INSERT INTO bot_settings (key, value, updated_at) VALUES ('zalo_zns_template_id', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
        [zaloZnsTemplateId]
      ).catch(() => {});
    }
  }
  return res.json({
    success: true,
    zaloZnsTemplateId,
    message: 'Đã lưu cấu hình Tổng đài Asterisk & Zalo ZNS Template ID!',
  });
});

// GET /quote/:trackingCode - Cổng Nhập Giá Nhanh (Quick Quote Portal) tối ưu cho Mobile của DCE Ops & Supplier
app.get('/quote/:trackingCode', async (req: Request, res: Response) => {
  const { trackingCode } = req.params;
  const order = await findOrderByTrackingCodeOrSuffix(trackingCode);
  if (!order) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="vi">
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Không tìm thấy đơn</title></head>
      <body style="font-family:sans-serif;padding:32px;text-align:center;background:#f8fafc;color:#1e293b;">
        <h2>❌ Không tìm thấy đơn hàng ${trackingCode}</h2>
        <p>Vui lòng kiểm tra lại mã vận đơn hoặc liên hệ DCE Ops (${dceOpsPhone}).</p>
      </body></html>
    `);
  }

  const sAddr = order.shippingInfo?.sender?.address || '(Chưa có)';
  const rAddr = order.shippingInfo?.receiver?.address || '(Chưa có)';
  const cargo = order.shippingInfo?.cargo?.name || 'Hàng hóa';
  const weight = order.shippingInfo?.cargo?.weight || (order.shippingInfo?.cargo?.weightKg ? `${order.shippingInfo.cargo.weightKg} kg` : 'Theo thực tế');
  const dims = order.shippingInfo?.cargo?.dimensions?.raw || 'Tiêu chuẩn';
  const notes = order.shippingInfo?.cargo?.specialNotes || 'Không có';
  const dt = order.shippingInfo?.deliveryTime || 'Thỏa thuận';

  return res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Báo Giá Nhanh - ${order.trackingCode} | Đi Chung Express</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f1f5f9; margin: 0; padding: 16px; color: #0f172a; }
        .card { max-width: 480px; margin: 0 auto; background: #fff; border-radius: 16px; box-shadow: 0 10px 25px rgba(15,23,42,0.08); overflow: hidden; border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #1d4ed8, #4338ca); color: #fff; padding: 20px; }
        .badge { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; margin-bottom: 6px; }
        .body { padding: 20px; }
        .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; font-size: 13.5px; line-height: 1.55; margin-bottom: 18px; }
        .label { font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 6px; display: block; }
        input, select, textarea { width: 100%; box-sizing: border-box; padding: 11px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font-size: 15px; margin-bottom: 12px; }
        .preview { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; padding: 12px; border-radius: 10px; font-size: 13px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; }
        .btn { width: 100%; background: #2563eb; color: #fff; border: none; padding: 14px; border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer; }
        .btn:disabled { opacity: 0.6; }
        .msg { margin-top: 14px; padding: 12px; border-radius: 10px; font-size: 13.5px; display: none; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="badge">ĐI CHUNG EXPRESS — QUICK QUOTE</div>
          <h2 style="margin:0;font-size:20px;">Đơn: ${order.trackingCode}</h2>
          <div style="font-size:12px;opacity:0.85;margin-top:4px;">Trạng thái: ${order.status === 'quoted' ? 'Đã báo giá (' + formatVnd(order.estimatedPrice || 0) + ')' : 'Chờ báo giá'}</div>
        </div>
        <div class="body">
          <div class="info-box">
            <div><strong>📍 Lấy hàng:</strong> ${sAddr}</div>
            <div style="margin-top:6px;"><strong>🎯 Giao hàng:</strong> ${rAddr}</div>
            <div style="margin-top:6px;"><strong>📦 Hàng hóa:</strong> ${cargo} | ${weight} | KT: ${dims}</div>
            <div style="margin-top:6px;"><strong>⏰ Thời gian:</strong> ${dt}</div>
            <div style="margin-top:6px;"><strong>📝 Ghi chú:</strong> ${notes}</div>
          </div>

          <form id="quoteForm">
            <label class="label">Người báo giá</label>
            <select id="quotedBy">
              <option value="DCE Ops (${dceOpsPhone})">DCE Ops (${dceOpsPhone})</option>
              <option value="${defaultSupplierName} (${defaultSupplierPhone})">${defaultSupplierName} (${defaultSupplierPhone})</option>
            </select>

            <label class="label">Giá cước nhập (VNĐ) — VD: 450000</label>
            <input type="number" id="baseCost" min="10000" step="1000" required placeholder="Nhập số tiền VNĐ..." value="${order.baseCostVnd || ''}" />

            <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:14px;cursor:pointer;">
              <input type="checkbox" id="applyMargin" checked style="width:auto;margin:0;" />
              <span>Tự động cộng <strong>+30% Margin</strong> để báo Khách hàng</span>
            </label>

            <div class="preview">
              <span>Giá dự kiến báo Khách:</span>
              <strong id="customerPreview" style="font-size:17px;">0 đ</strong>
            </div>

            <label class="label">Ghi chú thêm (tùy chọn)</label>
            <textarea id="quoteNote" rows="2" placeholder="VD: Đã gồm phí bốc xếp, xe tải 1.25 tấn...">${order.quoteNote || ''}</textarea>

            <button type="submit" class="btn" id="submitBtn">✅ Xác nhận & Gửi báo giá</button>
          </form>
          <div id="resultMsg" class="msg"></div>
        </div>
      </div>

      <script>
        const baseInput = document.getElementById('baseCost');
        const marginCheck = document.getElementById('applyMargin');
        const previewEl = document.getElementById('customerPreview');
        function updatePreview() {
          const val = parseFloat(baseInput.value || '0');
          if (!val || val <= 0) { previewEl.textContent = '0 đ'; return; }
          const finalPrice = marginCheck.checked ? Math.round((val * 1.3) / 1000) * 1000 : Math.round(val);
          previewEl.textContent = finalPrice.toLocaleString('vi-VN') + ' đ';
        }
        baseInput.addEventListener('input', updatePreview);
        marginCheck.addEventListener('change', updatePreview);
        updatePreview();

        document.getElementById('quoteForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = document.getElementById('submitBtn');
          const msg = document.getElementById('resultMsg');
          btn.disabled = true;
          btn.textContent = 'Đang lưu báo giá...';
          try {
            const res = await fetch('/api/orders/${encodeURIComponent(order.trackingCode)}/quote', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                baseCostVnd: Number(baseInput.value),
                applyMargin: marginCheck.checked,
                quotedBy: document.getElementById('quotedBy').value,
                quoteNote: document.getElementById('quoteNote').value.trim()
              })
            });
            const data = await res.json();
            msg.style.display = 'block';
            if (data.success) {
              msg.style.background = '#ecfdf5';
              msg.style.color = '#065f46';
              msg.innerHTML = '🎉 <strong>Đã lưu báo giá thành công!</strong><br/>Giá báo khách: <strong>' + Number(data.customerQuoteVnd).toLocaleString('vi-VN') + ' đ</strong>' + (data.customerNotified ? '<br/>📲 Đã tự động gửi tin nhắn báo giá tới Zalo Khách hàng!' : '');
            } else {
              msg.style.background = '#fef2f2';
              msg.style.color = '#991b1b';
              msg.textContent = '❌ Lỗi: ' + (data.error || 'Không thể lưu');
            }
          } catch (err) {
            msg.style.display = 'block';
            msg.style.background = '#fef2f2';
            msg.style.color = '#991b1b';
            msg.textContent = '❌ Lỗi kết nối máy chủ';
          } finally {
            btn.disabled = false;
            btn.textContent = '✅ Xác nhận & Gửi báo giá';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// POST /api/orders - Tạo hoặc cập nhật phiếu vận đơn vào Database
app.post('/api/orders', async (req: Request, res: Response) => {
  try {
    const { id, trackingCode, status, customerName, customerPhone, source, shippingInfo } = req.body;
    if (!shippingInfo) {
      return res.status(400).json({ error: 'shippingInfo is required' });
    }
    const saved = await saveShippingOrder({
      id,
      trackingCode,
      status,
      customerName,
      customerPhone,
      source: source || 'web',
      shippingInfo,
    });
    return res.json({ success: true, order: saved });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

// POST /api/orders/notify-ops - Chủ động bắn thông tin đơn hàng tới Zalo DCE Ops (0934691766) để gửi Supplier báo giá
app.post('/api/orders/notify-ops', async (req: Request, res: Response) => {
  try {
    const { id, trackingCode, status, customerName, customerPhone, source, shippingInfo } = req.body || {};
    if (!shippingInfo) {
      return res.status(400).json({ error: 'shippingInfo is required' });
    }
    const result = await notifyDceOps({
      id,
      trackingCode: trackingCode || shippingInfo?.trackingCode || generateTrackingCode(),
      status: status || 'created',
      customerName: customerName || shippingInfo?.sender?.name,
      customerPhone: customerPhone || shippingInfo?.sender?.phone,
      source: source || 'web',
      shippingInfo,
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

// GET /api/ops/status - Kiểm tra trạng thái liên kết Zalo của nhân sự điều phối DCE Ops
app.get('/api/ops/status', async (_req: Request, res: Response) => {
  return res.json({
    opsPhone: dceOpsPhone,
    opsUserId: dceOpsUserId || null,
    isLinked: Boolean(dceOpsUserId),
    supplierName: defaultSupplierName,
    supplierPhone: defaultSupplierPhone,
    supplierUserId: defaultSupplierUserId || null,
    isSupplierLinked: Boolean(defaultSupplierUserId),
  });
});

// GET /api/config/routing - Lấy cấu hình điều phối DCE Ops & Nhà cung cấp mặc định
app.get('/api/config/routing', async (_req: Request, res: Response) => {
  return res.json({
    opsPhone: dceOpsPhone,
    opsUserId: dceOpsUserId || null,
    isOpsLinked: Boolean(dceOpsUserId),
    supplierName: defaultSupplierName,
    supplierPhone: defaultSupplierPhone,
    supplierUserId: defaultSupplierUserId || null,
    isSupplierLinked: Boolean(defaultSupplierUserId),
  });
});

// POST /api/config/routing - Cập nhật cấu hình SĐT DCE Ops & Tên/SĐT Zalo Nhà cung cấp mặc định từ Web UI
app.post('/api/config/routing', async (req: Request, res: Response) => {
  const { opsPhone, supplierName, supplierPhone } = req.body || {};

  if (typeof opsPhone === 'string' && opsPhone.trim()) {
    dceOpsPhone = opsPhone.trim();
  }
  if (typeof supplierName === 'string' && supplierName.trim()) {
    defaultSupplierName = supplierName.trim();
  }
  if (typeof supplierPhone === 'string' && supplierPhone.trim()) {
    defaultSupplierPhone = supplierPhone.trim();
  }

  if (dbPool) {
    try {
      const pairs: Array<[string, string]> = [
        ['dce_ops_phone', dceOpsPhone],
        ['default_supplier_name', defaultSupplierName],
        ['default_supplier_phone', defaultSupplierPhone],
      ];
      for (const [k, v] of pairs) {
        await dbPool.query(
          `INSERT INTO bot_settings (key, value, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
          [k, v]
        );
      }
    } catch (e: any) {
      console.error('[API /api/config/routing] DB save error:', e?.message);
    }
  }

  return res.json({
    success: true,
    opsPhone: dceOpsPhone,
    opsUserId: dceOpsUserId || null,
    isOpsLinked: Boolean(dceOpsUserId),
    supplierName: defaultSupplierName,
    supplierPhone: defaultSupplierPhone,
    supplierUserId: defaultSupplierUserId || null,
    isSupplierLinked: Boolean(defaultSupplierUserId),
    message: 'Đã lưu cấu hình Điều phối Ops & Nhà cung cấp mặc định thành công!',
  });
});

// POST /api/pricing/calculate - Tính cước chuẩn tự động dựa trên Bảng giá chuẩn DC Express (Giai đoạn 1)
app.post('/api/pricing/calculate', async (req: Request, res: Response) => {
  try {
    const { shippingInfo } = req.body || {};
    if (!shippingInfo) {
      return res.status(400).json({ error: 'shippingInfo is required' });
    }
    const result = calculateDCExpressPriceFromShippingInfo(shippingInfo, activeStandardRoutes);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

// GET /api/pricing/routes - Lấy danh sách các tuyến trong Bảng giá chuẩn
app.get('/api/pricing/routes', async (_req: Request, res: Response) => {
  return res.json({ success: true, routes: activeStandardRoutes });
});

// POST /api/pricing/routes - Thêm hoặc cập nhật tuyến trong Bảng giá chuẩn
app.post('/api/pricing/routes', async (req: Request, res: Response) => {
  try {
    const route: StandardPriceRoute = req.body;
    if (!route || !route.routeCode || !route.originProvince || !route.destinationProvince) {
      return res.status(400).json({ error: 'routeCode, originProvince, destinationProvince are required' });
    }
    const id = route.id || `route-${route.routeCode.toLowerCase()}`;
    const normalized: StandardPriceRoute = {
      ...route,
      id,
      marginPercent: typeof route.marginPercent === 'number' ? route.marginPercent : 30,
      isActive: route.isActive !== false,
    };

    const idx = activeStandardRoutes.findIndex((r) => r.routeCode === normalized.routeCode);
    if (idx >= 0) {
      activeStandardRoutes[idx] = normalized;
    } else {
      activeStandardRoutes.push(normalized);
    }

    if (dbPool) {
      await dbPool.query(
        `INSERT INTO standard_price_routes (id, route_code, name, origin_province, destination_province, service_code, service_name, estimated_transit_time, margin_percent, tiers, is_active, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (route_code) DO UPDATE
         SET name = EXCLUDED.name,
             origin_province = EXCLUDED.origin_province,
             destination_province = EXCLUDED.destination_province,
             service_code = EXCLUDED.service_code,
             service_name = EXCLUDED.service_name,
             estimated_transit_time = EXCLUDED.estimated_transit_time,
             margin_percent = EXCLUDED.margin_percent,
             tiers = EXCLUDED.tiers,
             is_active = EXCLUDED.is_active,
             updated_at = NOW();`,
        [
          normalized.id,
          normalized.routeCode,
          normalized.name,
          normalized.originProvince,
          normalized.destinationProvince,
          normalized.serviceCode,
          normalized.serviceName,
          normalized.estimatedTransitTime,
          normalized.marginPercent,
          JSON.stringify(normalized.tiers),
          normalized.isActive,
        ]
      );
    }

    return res.json({ success: true, route: normalized, routes: activeStandardRoutes });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

// POST /api/ops/bind - Liên kết thủ công Zalo User ID cho DCE Ops
app.post('/api/ops/bind', async (req: Request, res: Response) => {
  const { userId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  dceOpsUserId = String(userId).trim();
  if (dbPool) {
    dbPool.query(
      `INSERT INTO bot_settings (key, value, updated_at) VALUES ('dce_ops_user_id', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
      [dceOpsUserId]
    ).catch(() => {});
  }
  return res.json({
    success: true,
    opsPhone: DCE_OPS_PHONE,
    opsUserId: dceOpsUserId,
    message: `Đã liên kết Zalo user_id ${dceOpsUserId} cho DCE Ops (${DCE_OPS_PHONE}) thành công.`,
  });
});

// DELETE /api/orders/:id - Xóa 1 phiếu vận đơn khỏi Database
app.delete('/api/orders/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const idx = inMemoryOrders.findIndex((o) => o.id === id);
  if (idx >= 0) inMemoryOrders.splice(idx, 1);
  if (dbPool) {
    try {
      await dbPool.query(`DELETE FROM shipping_orders WHERE id = $1`, [id]);
    } catch (err: any) {
      console.error('[API DELETE /api/orders/:id] Error:', err?.message);
    }
  }
  return res.json({ success: true, deletedId: id });
});

// DELETE /api/orders - Xóa toàn bộ lịch sử đơn hàng
app.delete('/api/orders', async (_req: Request, res: Response) => {
  inMemoryOrders.length = 0;
  if (dbPool) {
    try {
      await dbPool.query(`DELETE FROM shipping_orders`);
    } catch (err: any) {
      console.error('[API DELETE ALL /api/orders] Error:', err?.message);
    }
  }
  return res.json({ success: true, message: 'All orders cleared' });
});

// GET /api/db/overview - Xem cấu trúc và dữ liệu các bảng trong Database trực tiếp qua Web
app.get('/api/db/overview', async (_req: Request, res: Response) => {
  if (!dbPool) {
    return res.json({
      connected: false,
      message: 'Chưa cấu hình DATABASE_URL (Chưa kết nối PostgreSQL)',
      inMemoryStats: {
        customersCount: inMemoryCustomers.size,
        messagesCount: inMemoryMessages.length,
        sessionsCount: zaloUserSessions.size,
        ordersCount: inMemoryOrders.length,
      },
    });
  }

  try {
    const [authRes, custRes, msgRes, sessRes, ordRes] = await Promise.all([
      dbPool.query(`SELECT id, SUBSTRING(access_token FROM 1 FOR 10) || '...' as access_token_masked, SUBSTRING(refresh_token FROM 1 FOR 10) || '...' as refresh_token_masked, updated_at FROM zalo_auth`),
      dbPool.query(`SELECT COUNT(*) as count FROM crm_customers`),
      dbPool.query(`SELECT COUNT(*) as count FROM crm_messages`),
      dbPool.query(`SELECT COUNT(*) as count FROM zalo_sessions`),
      dbPool.query(`SELECT COUNT(*) as count FROM shipping_orders`),
    ]);

    const recentCustomers = await dbPool.query(`SELECT user_id, name, phone, last_interaction, last_message FROM crm_customers ORDER BY last_interaction DESC LIMIT 10`);
    const recentOrders = await dbPool.query(`
      SELECT id, tracking_code, source, status, created_at, customer_name, customer_phone,
             shipping_info->'cargo'->>'name' as cargo_name,
             shipping_info->'sender'->>'address' as sender_addr,
             shipping_info->'receiver'->>'address' as receiver_addr
      FROM shipping_orders
      ORDER BY created_at DESC
      LIMIT 10
    `);

    return res.json({
      connected: true,
      databaseType: 'Render PostgreSQL (shipbot-db)',
      tables: {
        zalo_auth: {
          description: 'Lưu trữ Access Token và Refresh Token Zalo OA vĩnh viễn',
          rowCount: authRes.rowCount,
          records: authRes.rows,
        },
        shipping_orders: {
          description: 'Lịch sử phiếu vận đơn khách hàng (Web & Zalo OA)',
          totalCount: parseInt(ordRes.rows[0]?.count || '0', 10),
          recentRecords: recentOrders.rows,
        },
        crm_customers: {
          description: 'Hồ sơ danh bạ khách hàng Zalo',
          totalCount: parseInt(custRes.rows[0]?.count || '0', 10),
          recentRecords: recentCustomers.rows,
        },
        crm_messages: {
          description: 'Toàn bộ lịch sử tin nhắn 2 chiều giữa khách và bot',
          totalCount: parseInt(msgRes.rows[0]?.count || '0', 10),
        },
        zalo_sessions: {
          description: 'Bộ nhớ ngữ cảnh phiên hội thoại (chống mất ngữ cảnh khi restart)',
          totalCount: parseInt(sessRes.rows[0]?.count || '0', 10),
        },
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

// Render Keepalive to prevent free tier idle spin-down
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || 'https://dce-shipbot.onrender.com';
setInterval(() => {
  fetch(`${RENDER_EXTERNAL_URL}/api/zalo/webhook`).catch(() => { });
}, 10 * 60 * 1000);

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ShipBot Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
