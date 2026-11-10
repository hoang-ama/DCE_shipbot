# DỰ ÁN: ĐI CHUNG EXPRESS SHIPBOT - INSTRUCTIONS FOR CODING AGENT

> **Tài liệu hướng dẫn bắt buộc dành cho Antigravity AI Coding Agent**.  
> Tài liệu này mô tả chi tiết Tech Stack, cấu trúc mã nguồn, các quy tắc nghiệp vụ/fine-tuning bắt buộc phải giữ nguyên, và lộ trình các module cần tiếp tục phát triển cho dự án Đi Chung Express ShipBot.

---

## 1. TECH STACK & MÔI TRƯỜNG HIỆN HÀNH (KHÔNG ĐƯỢC THAY ĐỔI)

Hệ thống hiện tại đang hoạt động ổn định trên production với các công nghệ sau:

| Thành phần | Công nghệ / Thư viện | Chi tiết cấu hình |
| :--- | :--- | :--- |
| **Backend** | **Node.js (v20+) + Express + TypeScript** | File chính: `server.ts`. Chạy HTTP server trên port 3000, hỗ trợ reverse proxy Render (`app.set('trust proxy', 1)`). |
| **Frontend** | **React 19 + TypeScript + Vite + Tailwind CSS** | Thư mục `src/`. Single Page Application tích hợp đầy đủ tương tác Chat, Phiếu vận đơn, CRM, Zalo Status. |
| **AI LLM Engine** | **Google Gemini API (`@google/genai`)** | Server-side client. Sử dụng model `gemini-3.8-flash` (hoặc `gemini-2.5-flash`), cấu hình Thinking Level phù hợp cho tác vụ bóc tách địa chính và tư vấn. |
| **Database** | **PostgreSQL (Render `shipbot-db`)** | Kết nối qua `pg.Pool`. Tự động cấu hình SSL bypass khi chạy trên mạng nội bộ VPC của Render. Gồm 5 bảng: `zalo_auth`, `shipping_orders`, `crm_customers`, `crm_messages`, `zalo_sessions`. |
| **Kênh tích hợp** | **Zalo Official Account OpenAPI v4** | Endpoint Webhook `/api/zalo/webhook`. Cơ chế 1-Click OAuth hỗ trợ bảo mật **PKCE** (`code_verifier` & `code_challenge`), tự động làm mới chủ động trước hạn ở mốc 18 giờ. |
| **Dữ liệu địa chính** | **`src/data/vnAdministrative.ts`** | Từ điển 63 tỉnh thành Việt Nam, danh sách quận/huyện, phường/xã, điểm mốc nổi tiếng và giải thuật bóc tách tọa độ Google Maps. |

---

## 2. QUY TẮC BẮT BUỘC VỀ DỮ LIỆU & HUẤN LUYỆN (FINE-TUNING RULES)

Khi chỉnh sửa mã nguồn hoặc phát triển tính năng mới, **TUYỆT ĐỐI BẢO TOÀN** các quy tắc logic nghiệp vụ sau:

### A. Quy tắc Dịch Ngược Địa Chính (Reverse Geocoding)
1. **Dịch ngược điểm mốc sang Phường/Xã**:
   - Khi khách hàng nhắn tên tòa nhà, địa danh, khu đô thị (ví dụ: *Keangnam, Landmark 81, Royal City, Times City, Bãi Cháy, KĐT PG An Đồng...*), hệ thống **bắt buộc phải dịch ngược** ra địa chỉ chi tiết có cấp Phường/Xã và Tỉnh/Thành phố.
   - Khi đã dịch ngược thành công (có Phường/Xã), đánh dấu `hasWardCommune = true` và **tuyệt đối không hỏi lại địa chỉ đó nữa**.
2. **Xử lý Link Google Maps & Tọa độ**:
   - Khi khách gửi link `maps.app.goo.gl` hoặc tọa độ GPS (`lat, lng`), hàm `parseGoogleMapsLocation` và Gemini phải dịch sang tên địa chỉ hành chính dạng text. Không bao giờ lưu link thô vào trường `address`.
3. **Chỉ hỏi lại khi hoàn toàn không có thông tin chi tiết**:
   - Chỉ khi khách chỉ nói cụt lủn tên tỉnh (*"ở Hà Nội"*, *"gửi vào Sài Gòn"*) hoặc tên quận chung chung (*"Cầu Giấy"*, *"Quận 1"*) mà không có đường/phường, mới hỏi lại địa chỉ chi tiết đến phường/xã.

### B. Quy tắc Thông Tin Hàng Hóa (Đạt 2/3 tiêu chí)
- Bắt buộc phải thu thập đủ ít nhất **2 trên 3 trường**: (1) Tên loại hàng, (2) Khối lượng kg, (3) Kích thước cm.
- **Tên hàng hóa (category)**: Phải chuẩn hóa về danh mục chung (*Hoa quả, Tài liệu, Quần áo, Thực phẩm, Hải sản, Đồ gia dụng, Linh kiện điện tử, Mỹ phẩm, Dược phẩm...*). Chi tiết cụ thể của món hàng được lưu vào `specialNotes`.

### C. Quy tắc Thời Gian Giao Nhận
- Phân biệt rõ thời gian với địa chỉ: Các cụm từ như *"hỏa tốc trong ngày"*, *"giao nhận hỏa tốc"*, *"trong ngày luôn"*, *"sáng mai"*, *"hẹn 15h"* thuộc trường `deliveryTime`. **Tuyệt đối không gán nhầm vào địa chỉ lấy hay địa chỉ giao**.

### D. Văn Phong & Ngăn Chặn Lặp Từ (Anti-Hallucination & Anti-Fluff)
- Xưng hô chuẩn người Việt: Xưng *"em"*, gọi *"anh/chị"*.
- **Loại bỏ câu rập khuôn máy móc**: Sử dụng hàm `cleanResponseText` để cắt bỏ các cụm từ thừa thãi như *"Dạ em đã ghi nhận thông tin"*, *"để bên em hỗ trợ mình ạ"*.
- **Xác nhận 4 dòng phân tách `\n`**: Khi đủ 4 thông tin critical, bắt buộc xuất câu chốt kèm form 4 dòng rõ ràng:
  ```text
  Dạ em đã nhận đủ thông tin đơn hàng, anh/chị xác nhận giúp em để em báo giá cho mình ạ:
  1) Địa chỉ lấy hàng: ...
  2) Địa chỉ giao hàng: ...
  3) Thông tin hàng: ...
  4) Thời gian giao nhận: ...
  ```

---

## 3. BẢN ĐỒ CẤU TRÚC MÃ NGUỒN (SOURCE CODE MAP)

```text
server.ts
├── Cấu hình Express, Trust Proxy, pg Pool kết nối PostgreSQL shipbot-db
├── SYSTEM_INSTRUCTION: Prompt chính của Đi Chung Express
├── vnAdministrative: Hàm chuẩn hóa và từ điển địa chính 63 tỉnh thành
├── processChatPipeline: Xử lý hội thoại, Fast Evaluator & gọi Gemini API
├── Zalo OA Controller:
│   ├── /api/zalo/webhook: Lắng nghe tin nhắn từ Zalo OA
│   ├── /api/zalo/oauth/login: Tạo URL xác thực OAuth v4 kèm PKCE (code_challenge)
│   ├── /api/zalo/oauth/callback: Nhận code, đối soát code_verifier, lưu token vào PostgreSQL
│   ├── /api/zalo/status: Báo cáo trạng thái token và logs kết nối
│   └── Cron Proactive Token Refresh: Tự động chạy mỗi 30p, gia hạn tại mốc 18 giờ
├── CRM Controller:
│   ├── inMemoryCustomers & crm_customers table
│   ├── inMemoryMessages & crm_messages table
│   └── /api/crm/*: API danh bạ, lịch sử chat và gửi tin nhắn trực tiếp
├── Orders Controller:
│   ├── shipping_orders table
│   ├── saveShippingOrder: Hàm lưu đơn (đồng bộ Web & Zalo OA)
│   └── /api/orders: GET, POST, DELETE đơn vận chuyển
└── /api/db/overview: API trực quan xem số lượng bản ghi và cấu trúc DB

src/
├── App.tsx: Điều phối trạng thái toàn cục (tin nhắn, phiếu đơn, modals)
├── types.ts: Định nghĩa ShippingInfo, OrderRecord, CRM types
├── utils/logistics.ts: Sinh mã VN-LOG, định dạng tóm tắt đơn
├── data/vnAdministrative.ts: Bộ từ điển địa chính 63 tỉnh thành và geocoding
└── components/
    ├── Header.tsx: Thanh công cụ (Zalo badge, CRM, Lịch sử, Tạo mới)
    ├── ChatPanel.tsx: Giao diện nhắn tin, nhập giọng nói
    ├── WaybillCard.tsx: Phiếu vận đơn trực quan 4 trường
    ├── OrderHistoryModal.tsx: Quản lý lịch sử đơn (PostgreSQL sync)
    ├── ZaloStatusModal.tsx: Bảng điều khiển Zalo OA, 1-Click PKCE button
    └── CrmModal.tsx: Bảng điều khiển CRM và chat trực tiếp với khách
```

---

## 4. KẾ HOẠCH NÂNG CẤP TIẾP THEO (NEXT MODULES ROADMAP)

Agent cần thực hiện các nhiệm vụ tiếp theo theo đúng thứ tự ưu tiên dưới đây:

### Module 1: Tích Hợp Động Cơ RAG Tính Cước (`pricing_engine`)
- **Mục tiêu**: Sau khi khách hàng xác nhận form 4 dòng, hệ thống tự động tính cước và đưa ra lựa chọn gói dịch vụ (Đường bộ tiết kiệm vs Hỏa tốc đường bay).
- **Yêu cầu triển khai**:
  1. Tạo file `src/utils/pricingEngine.ts` và tích hợp vào `server.ts`.
  2. Triển khai công thức quy đổi thể tích theo `RAG_PRICING_ENGINE.md`:
     - Đường hàng không: `Dài x Rộng x Cao / 6000`
     - Đường bộ: `Dài x Rộng x Cao / 5000`
     - Cước phí: $\text{Giá báo KH} = \text{Giá gốc đối tác} + 30\% \text{ Margin}$.
  3. Báo giá tự động 2 gói dịch vụ trên giao diện Chat và cập nhật lên `WaybillCard.tsx`.
  4. Hỗ trợ chính sách thương lượng: Khách chê đắt lần 1 $\rightarrow$ giảm 10%; khách từ chối lần 2 $\rightarrow$ kích hoạt cờ chuyển cho nhân viên tư vấn.

### Module 2: Tự Động Hóa Giai Đoạn 3, 4, 5 (Vận Hành & Chốt Đơn Hoàn Chỉnh)
- **Mục tiêu**: Triển khai trọn vẹn kịch bản 5 giai đoạn:
  - Giai đoạn 3: Hỏi thông tin liên lạc 2 đầu (Tên, SĐT), Bên thanh toán (Đầu gửi/Đầu nhận), Hình thức thanh toán (Tiền mặt/Chuyển khoản).
  - Giai đoạn 4: Hỏi nhanh VAT & Bảo hiểm bổ sung.
  - Giai đoạn 5: Xuất Phiếu xác nhận đơn hàng (Order Confirmation) hoàn chỉnh và lưu vào PostgreSQL.

### Module 3: Tích Hợp API Bắn Lead Sang DC Hub Portal (`portal.dichung.vn`)
- **Mục tiêu**: Khi đơn hàng đạt trạng thái `confirmed`, tự động tạo payload JSON chuẩn (theo schema trong `PROJECT_OVERVIEW.md`) và gọi API POST sang cổng điều phối DC Hub Portal.
- **Yêu cầu triển khai**:
  - Tạo cấu hình `DCHUB_PORTAL_API_URL` và `DCHUB_PORTAL_TOKEN` trong `.env`.
  - Có cơ chế retry và ghi log sự kiện vào cơ sở dữ liệu.

### Module 4: Tích Hợp Tổng Đài VoIP Asterisk / Callbot AI
- **Mục tiêu**: Mở rộng kênh Hotline `19006022` / `0901778008` qua SIP Trunk Asterisk, kết nối STT Whisper và TTS tiếng Việt để tiếp nhận đơn hàng qua giọng nói tự động.

---

## 5. LỆNH THỰC THI CHUẨN (STANDARD COMMANDS)

Khi làm việc trong môi trường dòng lệnh:

```bash
# 1. Kiểm tra lỗi Typescript toàn diện (không sinh file)
npx tsc --noEmit

# 2. Build ứng dụng sản xuất (Vite build)
npm run build

# 3. Chạy server ở môi trường Local Development
npm run dev

# 4. Kiểm tra Git status (Lưu ý: Git commands yêu cầu BypassSandbox: true)
git status
git add -A && git commit -m "feat: your feature summary"
git push origin main
```

---

> **Nguyên tắc cốt lõi**: Luôn giữ vững tính ổn định của hệ thống hiện tại, bảo toàn kết nối PostgreSQL `shipbot-db`, cơ chế OAuth PKCE Zalo OA và các giải thuật địa chính tiếng Việt đã được tinh chỉnh.
