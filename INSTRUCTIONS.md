# DỰ ÁN: ĐI CHUNG EXPRESS SHIPBOT — INSTRUCTIONS FOR CODING AGENT & DEVELOPERS

> **Tài liệu hướng dẫn kỹ thuật dành cho AI Coding Agent và Lập trình viên**.  
> Quy định rõ Tech Stack, bản đồ mã nguồn thực tế, các quy tắc nghiệp vụ bất biến và lệnh kiểm thử trước khi đẩy code lên GitHub (`main`).

---

## 1. TECH STACK & MÔI TRƯỜNG VẬN HÀNH

| Thành phần | Công nghệ / Thư viện | Chi tiết cấu hình hiện hành |
| :--- | :--- | :--- |
| **Backend** | **Node.js v22+ + Express + TypeScript (`tsx`)** | File chính: `server.ts`. Chạy mặc định tại `HOST=0.0.0.0`, `PORT=2700`, triển khai Docker sau Reverse Proxy (`https://ai.dichung.vn`). |
| **Frontend** | **React 19 + TypeScript + Vite 8 + Tailwind CSS v4** | Thư mục `src/frontend/`. Build đa trang: `index.html` (Web CRM & Ops), `playground.html` (Simulator 3 kênh), `dichung.html`. |
| **AI & Multi-Agent** | **Google Gemini (`@google/genai`) + Rule Engine** | `gemini-3.8-flash`, `gemini-3.1-flash-lite`, `gemini-3.5-transcribe` kèm rule fallback offline khi thiếu `GEMINI_API_KEY`. |
| **Database** | **PostgreSQL (`pg` Pool)** | Migration tại `src/database/migrations/001_express.sql`, tự động khôi phục khi boot trong `src/database/bootstrap.ts`. |
| **Kênh & Điều phối** | **Zalo OA OpenAPI v4 + Asterisk VoIP + VietQR** | PKCE OAuth (`refresh` trước hạn 18h), Phiên 24h cố định, Quote-Reply đa đơn (`order_dispatch_threads`), bảo mật tùy chọn `ADMIN_PASSCODE`. |

---

## 2. QUY TẮC BẮT BUỘC KHI CHỈNH SỬA CODE

### A. Quy tắc Kênh Zalo OA vs Web Chat
1. **Zalo OA mặc định vào thẳng `express`**: Trong [`src/chatbot/services/router.ts`](src/chatbot/services/router.ts), khi truyền `{ channel: 'zalo' }`, tuyệt đối **không trả về `GROUP_MENU`** cả lúc chào đầu lẫn khi khách nhắn `reset` / `tạo đơn mới` / `menu`.
2. **Web Chat giữ `GROUP_MENU`**: Chỉ kênh `web` (mặc định khi `channel !== 'zalo'`) mới hiển thị menu 3 nhóm dịch vụ.

### B. Quy tắc Phiên Chat Cố Định 24h & Handover
1. **Cửa sổ 24h cố định (`CHAT_SESSION_TTL_MS`)**: Mọi tương tác gắn mã phiên `CHAT-DDMM-XXXX` tính từ `sessionStartedAt` (không reset trượt theo từng tin nhắn).
2. **Zalo ID Alias & Handover**: Luôn ánh xạ hai chiều giữa `user_id_by_app` và `sender.id` / `recipient.id` qua `linkZaloIds` & `getLinkedZaloIds` ([`src/modules/zalo/outbound-tracking.ts`](src/modules/zalo/outbound-tracking.ts)). Khi `humanTakeover = true` trong phiên 24h, AI **phải im lặng** (cả webhook text, idle follow-up 5 phút lẫn Asterisk greeting). Chỉ bật lại AI khi nhận lệnh `#bot`/`#ai` hoặc thao tác bật lại từ CRM Web, hoặc khi hết 24h mở phiên mới.

### C. Quy tắc Địa Chính, Hàng Hóa & Chống Ghi Đè
1. **Dịch ngược địa danh**: Điểm mốc, tòa nhà, KĐT, link Google Maps phải dịch ngược tới cấp **Phường/Xã, Quận/Huyện, Tỉnh/Thành phố** (`hasWardCommune = true`) dùng [`src/shared/data/vnAdministrative.ts`](src/shared/data/vnAdministrative.ts) & [`src/chatbot/validation/field-check.ts`](src/chatbot/validation/field-check.ts).
2. **Thông tin hàng hóa & Thời gian**: Đạt tối thiểu **2/3 tiêu chí** (*Loại hàng, Khối lượng, Kích thước*). Các từ chỉ thời gian (*"trong ngày"*, *"sáng mai"*, *"15h"*) luôn đưa vào `deliveryTime`.
3. **Chống ghi đè (Anti-Overwrite)**: Bảo toàn các guard trong [`src/chatbot/extraction/express.ts`](src/chatbot/extraction/express.ts) (`isConversationalOrQuestion`, `hasExplicitAddressSignal`, `isNotValidAddress`) để câu hỏi/giục nhanh của khách không bao giờ ghi đè địa chỉ đã có.

### D. Quy tắc Multi-Agent Orchestrator, Margin +30% & Đa Đơn
1. **Luồng Waterfall 2 cấp (`DCE -> CSĐT`)**: Đơn ngoại lệ chưa có trong bảng giá chuẩn phải gửi **Cấp 1 (`DCE Ops`)** trước (`WAITING_DCE`). Chỉ chuyển **Cấp 2 (`CSĐT`)** khi DCE trả lời từ chối (`REJECT`) hoặc khi `dceOpsUserId` chưa được gắn.
2. **Cộng `+30% Margin` thống nhất**: Cả DCE (Cấp 1) và CSĐT (Cấp 2) đều nhắn giá gốc (VD `"1tr2"` $\rightarrow$ `1.200.000`). Hệ thống bắt buộc tính `customerQuoteVnd = Math.round(baseCostVnd * 1.3)` (`1.560.000 VNĐ`) trước khi báo khách.
3. **Khớp đa đơn & VietQR song song**: Gửi tin nhắn cho đối tác phải qua `sendZaloOAReplyWithMeta` để lưu `zaloMsgId` vào `order_dispatch_threads`. Khi khách chọn `"Thanh toán lúc gửi hàng"`, luôn gửi link `/pay/:trackingCode` (vẫn cho COD) **song song** với bước hỏi đối tác SĐT Tài xế.

---

## 3. BẢN ĐỒ CẤU TRÚC MÃ NGUỒN (SOURCE CODE MAP)

```text
server.ts                            # Entrypoint HTTP: /api/chat, /api/zalo/webhook, /api/dispatch, Vite dev & dist/ prod fallback
├── src/config/
│   ├── env.ts                       # PORT, HOST (0.0.0.0), ADMIN_PASSCODE, GEMINI_API_KEY, DATABASE_URL, ZALO_*
│   ├── runtime.ts                   # Cấu hình động Zalo/Chatbot/Supplier/Payment/Asterisk
│   ├── chatbot-ai.ts & paths.ts
├── src/shared/
│   ├── access-guard.ts              # Middleware kiểm tra ADMIN_PASSCODE trên các endpoint quản trị
│   ├── system-routes.ts             # GET /api/health, GET /api/auth/status, POST /api/auth/verify
│   ├── service-menu.ts              # GROUP_MENU & GROUP_CHOICES (kênh Web)
│   ├── types.ts & shipment-format.ts
│   └── data/vnAdministrative.ts     # Từ điển địa chính 63 tỉnh thành & geocoding
├── src/database/
│   ├── connection.ts                # PostgreSQL pg.Pool
│   ├── migrations/001_express.sql   # Schema đầy đủ (shipping_orders, order_dispatch_threads, crm_*, zalo_*, ...)
│   ├── bootstrap.ts                 # Khởi tạo bảng & restore state (bỏ qua session >24h)
│   └── routes.ts                    # /api/db/overview
├── src/chatbot/
│   ├── engine.ts & services/        # router.ts (Web GROUP_MENU vs Zalo express), express.ts, ride/rent/truck/tour.ts
│   ├── extraction/ & validation/    # express.ts, field-check.ts, field-schema.ts, reply.ts
│   ├── agents/                      # dispatchAgent.ts, intakeAgent.ts, closingAgent.ts, mediaAgent.ts, gemini-structured.ts
│   └── playground/                  # routes.ts & service.ts cho /api/chatbot/* (ủy quyền tới src/chatbot/agents/)
├── src/orchestrator/
│   ├── stateMachine.ts              # 15 OrderWorkflowState, transitions, order_dispatch_threads & đa đơn disambiguation
│   ├── coordinator.ts               # handlePartnerZaloMessage() & handleCustomerZaloWorkflow()
│   └── routes.ts                    # GET /api/dispatch/orders & POST /api/dispatch/orders/:trackingCode/action
├── src/modules/
│   ├── conversation/ & handover/    # Phiên 24h cố định & Human Handover đồng bộ alias
│   ├── zalo/                        # OAuth PKCE, Token Refresh 18h, sender.ts (kèm messageId), outbound-tracking.ts
│   ├── customer/ & booking/         # CRM 24h + Auto-save đơn hàng vào PostgreSQL
│   ├── pricing/ & supplier/         # engine.ts, quotes.ts (/quote), commands.ts (#ops/#supplier/#baogia), service.ts
│   └── payment/ & asterisk/         # VietQR (/pay), Webhook ngân hàng, Asterisk VoIP -> Zalo ZNS/24h session
└── src/frontend/
    ├── App.tsx, main.tsx, index.css
    ├── components/                  # Header, ChatPanel, WaybillCard, CrmModal (lọc phiên 24h), DispatchMonitorModal, AdminAuthModal, ZaloStatusModal, OrderHistoryModal
    ├── playground/                  # Simulator 3 kênh (/playground.html) + StateTracker + MermaidModal
    └── utils/                       # auth.ts (interceptor x-admin-passcode), logistics.ts, pricingEngine.ts
```

---

## 4. HẠNG MỤC ĐÃ HOÀN THÀNH & KẾ HOẠCH TIẾP THEO

- **Đã hoàn thành**:
  - Tách module hoàn chỉnh Server (`src/modules`), AI Sub-Agents (`src/chatbot/agents`), Master Orchestrator (`src/orchestrator`), Database (`src/database`).
  - Động cơ tính giá chuẩn `RAG Pricing Engine` (`src/modules/pricing/engine.ts`), Portal `/quote/:code`, `/pay/:code`, Webhook VietQR & Asterisk VoIP.
  - Phiên 24h cố định, Alias Zalo Handover, Waterfall 2 cấp `DCE -> CSĐT` (+30% Margin), Quote-Reply đa đơn, UI Điều phối Live & Khung bảo mật `ADMIN_PASSCODE`.
- **Tiếp theo (Checklist triển khai)**:
  1. Liên kết `#ops` (`0934691766`) và `#supplier` (`0906106066`) trên môi trường production & chạy UAT đơn thật.
  2. Cấu hình tài khoản ngân hàng VietQR thật, Webhook SePay/Casso, Zalo ZNS Template ID & bật `ADMIN_PASSCODE` trong `.env` VPS.
  3. Mở rộng **Multi-Supplier Routing** theo tuyến/loại xe và kết nối API đồng bộ **DC Hub Portal** (`portal.dichung.vn`) + báo cáo KPI.

---

## 5. LỆNH KIỂM THỬ & TRIỂN KHAI CHUẨN

Mọi chỉnh sửa mã nguồn bắt buộc chạy qua 3 lệnh kiểm tra sau và không có lỗi trước khi đẩy lên `main`:

```bash
# 1. Chạy toàn bộ unit & orchestrator tests (chế độ offline, không cần API key / DB)
npm test

# 2. Kiểm tra lỗi TypeScript toàn dự án
npm run lint

# 3. Build bundle production (index.html, playground.html, dichung.html -> dist/)
npm run build
```

Ngoài ra:
- Chạy local development: `npm run dev` (truy cập `http://localhost:2700` và `http://localhost:2700/playground.html`).
- Chú ý giữ `.gitignore` luôn bỏ qua `.env`, `.zalo_token.json`, `.zalo_sessions.json`, `dist/` và **không** ignore `src/database/migrations/*.sql`.
