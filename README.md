# 📦 Đi Chung Express ShipBot (`DCE_shipbot`) — Unified Multi-Agent AI & Logistics Orchestrator

[![Node.js CI](https://img.shields.io/badge/Node.js-v22+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Gemini API](https://img.shields.io/badge/Google%20GenAI-Gemini%20Flash-orange.svg)](https://ai.google.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Docker%20shipbot--db-336791.svg)](https://www.postgresql.org/)
[![Zalo OA](https://img.shields.io/badge/Zalo%20OA-OpenAPI%20v4-0068ff.svg)](https://developers.zalo.me/)
[![Deploy](https://img.shields.io/badge/Deploy-VPS%20Linux%20%2B%20Docker-2496ed.svg)](https://ai.dichung.vn)

Hệ thống AI Agent CSKH và **Master Multi-Agent Logistics Orchestrator** cho **Đi Chung Express** (`dichung.vn` / `dichungexpress.com`), vận hành tại **[https://ai.dichung.vn](https://ai.dichung.vn)**. Kiến trúc được tổ chức theo mô hình tách biệt hoàn toàn **Server / Nghiệp vụ (`src/modules`)**, **AI Sub-Agents (`src/chatbot/agents`)**, **Master Orchestrator 15 trạng thái (`src/orchestrator`)**, **Database PostgreSQL (`src/database`)** và **React 19 Frontend (`src/frontend`)**.

---

## 🌟 Điểm Nổi Bật & Tính Năng Đã Hoàn Thiện

### 1. Tiếp Nhận Đa Kênh & Tách Biệt Kênh Zalo vs Web
- **Zalo OA vào thẳng Chuyển phát hàng (`express`)**: Khách nhắn qua Zalo OA đi thẳng vào luồng thu thập 4 thông tin cốt lõi (*Địa chỉ lấy hàng, Địa chỉ giao hàng, Thông tin hàng, Thời gian giao nhận*), **không hiển thị `GROUP_MENU`**.
- **Web Chat (`/api/chat`) đa dịch vụ**: Giữ menu phân nhóm dịch vụ (`Chuyển người: Đặt xe / Thuê xe`, `Chuyển hàng: Chuyển phát nhanh / Thuê xe tải`, `Du lịch: Tour / Khách sạn`).
- **Tổng đài Asterisk VoIP $\rightarrow$ Zalo OA ([ASTERISK_INTEGRATION.md](ASTERISK_INTEGRATION.md))**: Tiếp nhận webhook `CallerID` tại `/api/asterisk/incoming-call`, khởi tạo lời chào Zalo OA/ZNS đồng bộ với phiên chat 24h và tôn trọng trạng thái handover.
- **Dịch ngược địa chính & Chống ghi đè thông tin**: Chuẩn hóa địa danh/link Google Maps tới cấp Phường/Xã theo [`src/shared/data/vnAdministrative.ts`](src/shared/data/vnAdministrative.ts); lọc các câu cảm thán, giục nhanh, hỏi đáp trong [`src/chatbot/extraction/express.ts`](src/chatbot/extraction/express.ts) để không ghi đè nhầm địa chỉ/thời gian.

### 2. Phiên Chat Cố Định 24 Giờ & Handover Chính Xác
- Mỗi khách hàng được cấp một **Mã phiên cố định 24h (`CHAT-DDMM-XXXX`)** tính từ tin nhắn mở đầu phiên ([`src/modules/conversation/service.ts`](src/modules/conversation/service.ts)).
- **Đồng bộ Zalo ID Alias**: Tự động liên kết hai chiều `user_id_by_app <-> sender.id / recipient.id` ([`src/modules/zalo/outbound-tracking.ts`](src/modules/zalo/outbound-tracking.ts)).
- **Human Handover 24h**: Khi nhân viên Ops nhắn trên app Zalo OA (`oa_send_*`) hoặc qua CRM Web, AI **dừng hoàn toàn suốt phiên 24h** (chỉ mở lại khi sang phiên mới sau 24h hoặc nhân viên nhắn `#bot` / `#ai` hoặc bấm nút trên CRM).

### 3. Điều Phối Báo Giá 2 Cấp (`DCE Ops` $\rightarrow$ `CSĐT`) & Tự Động `+30% Margin`
- **Tuyến có trong Bảng giá chuẩn (`standard_price_routes`)**: Tự động tính trọng lượng quy đổi thể tích, phụ phí và báo giá `+30% Margin` ngay lập tức ([`src/modules/pricing/engine.ts`](src/modules/pricing/engine.ts)).
- **Tuyến ngoại lệ — Waterfall 2 cấp ([`src/orchestrator/coordinator.ts`](src/orchestrator/coordinator.ts))**:
  1. Đẩy yêu cầu kèm Form 4 trường sang **Cấp 1: DCE Ops (`#ops` — `0934691766`)** trước (`WAITING_DCE`).
  2. Chỉ khi DCE Ops từ chối (`"Không"`, `"Ko nhận"`, `"Hết xe"`...) hoặc chưa gắn `#ops`, hệ thống mới tự động chuyển sang **Cấp 2: CSĐT (`#supplier` — mặc định `Dichung Express - 0906106066`)** (`WAITING_CSDT`).
- **Tự động cộng `+30% Margin` cho cả 2 cấp**: Khi DCE Ops hoặc CSĐT nhắn giá gốc (hỗ trợ viết tắt như `"1tr2"`, `"850k"`), AI tự nhân `+30%` (`1.200.000` $\rightarrow$ `1.560.000 VNĐ`) trước khi soạn câu báo giá CSKH gửi khách.
- **Khớp đa đơn Zalo (`order_dispatch_threads`)**: Lưu `zaloMsgId` mỗi tin gửi đối tác để hỗ trợ **Zalo Quote-Reply**, khớp theo `#4_số` cuối, tự khớp khi có 1 đơn chờ, và hỏi lại nhanh khi có $\ge 2$ đơn chưa rõ mã.

### 4. Luồng Chốt Đơn 4 Bước, Thanh Toán VietQR Song Song & Điều Phối Tài Xế
- Sau khi khách đồng ý báo giá (`ACCEPT`), hệ thống tự động dẫn dắt 4 bước: **SĐT người nhận** $\rightarrow$ **SĐT người gửi** $\rightarrow$ **Bên thanh toán** $\rightarrow$ **Thời điểm thanh toán**.
- Nếu khách chọn **"Thanh toán lúc gửi hàng"**, bot gửi link **VietQR động (`/pay/:trackingCode`, vẫn hỗ trợ COD)** cho khách **song song** với việc nhắn đối tác chốt đơn và xin **SĐT Tài xế** $\rightarrow$ gửi SĐT tài xế cho khách & hoàn tất (`COMPLETED`).
- Cho phép thương lượng giảm **10%** (1 lần duy nhất, không thấp hơn sàn `baseCost * 1.1`) hoặc chuyển tiếp câu hỏi thắc mắc (`ASK_INFO`) hai chiều giữa Khách $\leftrightarrow$ Đối tác.

### 5. Giao Diện Quản Trị, Simulator 3 Kênh & Bảo Mật `ADMIN_PASSCODE`
- **Giao diện chính (`/`)**: Chat AI Web, Phiếu vận đơn trực quan (`WaybillCard`), **CRM Khách Zalo** (lọc hội thoại theo từng phiên 24h), **Điều phối Live 3 Kênh** (`DispatchMonitorModal`), cấu hình **Zalo OA** & lịch sử đơn.
- **Simulator 3 Kênh (`/playground.html`)**: Mô phỏng trực tiếp chu trình 15 trạng thái giữa Khách hàng $\leftrightarrow$ AI CSKH $\leftrightarrow$ DCE $\leftrightarrow$ CSĐT kèm sơ đồ State Machine (Mermaid), dịch thuật và nhập giọng nói (`gemini-3.5-transcribe` / `gemini-3.8-flash`).
- **Bảo vệ API quản trị nhẹ (`ADMIN_PASSCODE`)**: Khi đặt biến `ADMIN_PASSCODE` trong `.env`, [`src/shared/access-guard.ts`](src/shared/access-guard.ts) tự yêu cầu đăng nhập ([`AdminAuthModal.tsx`](src/frontend/components/AdminAuthModal.tsx)) cho các endpoint nhạy cảm (`/api/crm/*`, `/api/dispatch/*`, `/api/orders`, `/api/config/*`, `/api/ops/*`, `/api/pricing/routes*`, `/api/zalo/oauth/*`, `/api/db/*`); khi để trống `ADMIN_PASSCODE` sẽ mở để thuận tiện UAT.

---

## 🏗️ Kiến Trúc Hệ Thống

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│                      KÊNH GIAO TIẾP & GIAO DIỆN WEB UI                        │
│  • Web App (/): Chat đa dịch vụ, Waybill, CRM 24h, Điều phối Live, Zalo Modal  │
│  • Simulator (/playground.html): Giả lập 3 cột Khách <-> DCE <-> CSĐT          │
│  • Zalo OA OpenAPI v4: Khách (thẳng Express), DCE Ops (#ops), CSĐT (#supplier) │
│  • Asterisk VoIP: IVR chào & đẩy CallerID sang /api/asterisk/incoming-call     │
└───────────────────────────────────────┬────────────────────────────────────────┘
                                        ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                  EXPRESS BACKEND & MULTI-AGENT ORCHESTRATOR                    │
│  • server.ts (PORT 2700, HOST 0.0.0.0, AccessGuard, Vite / dist/ Static)       │
│  • src/orchestrator/ (15-State Machine, Coordinator, Thread Quote-Reply)       │
│  • src/chatbot/agents/ (intakeAgent, dispatchAgent, closingAgent, mediaAgent)  │
│  • src/modules/ (zalo, customer, conversation, handover, booking, pricing...)  │
└───────────────────────────────────────┬────────────────────────────────────────┘
                                        ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                 POSTGRESQL DATABASE (Docker: shipbot-db)                       │
│  • shipping_orders (+workflow_state, assigned_partner, chat_session_id, ...)   │
│  • order_dispatch_threads   • standard_price_routes   • bot_settings           │
│  • crm_customers (+session_started_at, human_takeover)  • crm_messages         │
│  • zalo_auth                • zalo_sessions           • asterisk_call_logs     │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Cấu Trúc Thư Mục Dự Án

```text
DCE_shipbot/
├── README.md                          # Tài liệu tổng quan dự án
├── PROJECT_OVERVIEW.md                # Bối cảnh nghiệp vụ, kiến trúc & schema DB
├── INSTRUCTIONS.md                    # Quy chuẩn kỹ thuật cho AI Agent & Lập trình viên
├── RAG_PRICING_ENGINE.md              # Công thức quy đổi, bảng giá chuẩn & +30% Margin
├── ROADMAP_AUTOMATION.md              # Sơ đồ End-to-End 15 trạng thái & lộ trình phát triển
├── ASTERISK_INTEGRATION.md            # Cấu hình Dialplan Asterisk VoIP -> Zalo OA/ZNS
├── DELIVERY_GUIDE_AND_TRACKER.md      # Hướng dẫn cho Biz Owner & Master Progress Tracker
├── DELIVERY_TRACKER_GSHEET.csv        # Bảng dữ liệu tracker đồng bộ với Google Sheets
├── Dockerfile & docker-compose.yml    # Đóng gói & vận hành Docker trên VPS
├── .github/workflows/deploy.yml       # CI/CD: lint -> Docker build/push -> VPS deploy
├── server.ts                          # Express entrypoint (/api/chat, /api/zalo/webhook, /api/dispatch)
├── index.html | playground.html | dichung.html
├── tests/                             # Bộ test offline (npm test -> 49/49 pass)
│   ├── chatbot.test.ts
│   ├── orchestrator.test.ts           # Test Zalo Express default, 24h handover, +30%, waterfall, đa đơn
│   ├── ai-routing-rules.test.ts
│   ├── ai-trace-copy.test.ts
│   └── service-router.test.ts
└── src/
    ├── config/                        # env.ts, runtime.ts, chatbot-ai.ts, paths.ts
    ├── shared/                        # access-guard.ts, system-routes.ts, service-menu.ts, types.ts, data/vnAdministrative.ts
    ├── database/                      # connection.ts, bootstrap.ts, routes.ts, migrations/001_express.sql
    ├── chatbot/
    │   ├── agents/                    # dispatchAgent.ts, intakeAgent.ts, closingAgent.ts, mediaAgent.ts, gemini-structured.ts
    │   ├── extraction/ & validation/  # express.ts, field-check.ts, field-schema.ts, reply.ts
    │   ├── rules/ & services/         # router.ts, express.ts, ride.ts, rent.ts, truck.ts, tour.ts
    │   └── playground/                # routes.ts, service.ts, types.ts
    ├── orchestrator/                  # stateMachine.ts, coordinator.ts, routes.ts
    ├── modules/                       # asterisk, booking, conversation, customer, handover, payment, portal, pricing, supplier, zalo
    └── frontend/                      # App.tsx, components/ (DispatchMonitorModal, AdminAuthModal, CrmModal...), playground/, utils/
```

---

## ⚙️ Biến Môi Trường (`.env`)

Tham khảo [`.env.example`](.env.example):

```ini
# --- SERVER & RUNTIME ---
PORT=2700
HOST=0.0.0.0
NODE_ENV=production
APP_URL="https://ai.dichung.vn"
ADMIN_PASSCODE=""

# --- GEMINI AI ---
GEMINI_API_KEY="your_gemini_api_key_here"

# --- POSTGRESQL (Docker Compose) ---
POSTGRES_USER=shipbot
POSTGRES_PASSWORD=shipbot_secret
POSTGRES_DB=shipbot_db
POSTGRES_PORT=2732
DATABASE_URL="postgresql://shipbot:shipbot_secret@postgres:2732/shipbot_db"

# --- ZALO OFFICIAL ACCOUNT (OpenAPI v4) ---
ZALO_APP_ID="4541345519906352744"
ZALO_APP_SECRET="your_zalo_app_secret_here"
ZALO_OA_ACCESS_TOKEN=""
ZALO_REFRESH_TOKEN=""
```

---

## 🚀 Cài Đặt, Kiểm Thử & Deploy

```bash
# Cài đặt dependencies & chạy local dev (Express + Vite HMR ở port 2700)
npm install
cp .env.example .env
npm run dev

# Chạy toàn bộ unit & orchestrator tests (offline, không cần GEMINI_API_KEY/DATABASE_URL)
npm test

# Kiểm tra TypeScript strict & build production bundle
npm run lint
npm run build
npm start
```

- **CI/CD Deploy VPS**: Mỗi commit đẩy lên `main` sẽ kích hoạt [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) để kiểm tra `npm run lint`, build Docker image đẩy lên GHCR và tự động deploy lên VPS tại `https://ai.dichung.vn`.

---

## 📡 Danh Sách API & Portal Chính

| Nhóm | Endpoint | Quyền | Chức năng |
| :--- | :--- | :---: | :--- |
| **System / Auth** | `GET /api/health`, `GET /api/auth/status`, `POST /api/auth/verify` | Public | Kiểm tra tình trạng server & xác thực `ADMIN_PASSCODE` |
| **Chat & Webhook** | `POST /api/chat`, `POST /api/zalo/webhook`, `POST /api/asterisk/incoming-call`, `POST /api/payment/vietqr-webhook` | Public | Pipeline chat Web, Webhook Zalo OA, Asterisk VoIP & SePay/Casso |
| **Portals 1-Click** | `GET /quote/:trackingCode`, `POST /api/orders/:trackingCode/quote`, `GET /pay/:trackingCode`, `POST /api/orders/:trackingCode/payment` | Public | Form nhập giá đối tác (+30%) & cổng thanh toán VietQR/COD |
| **Simulator** | `POST /api/chatbot/*` (`/customer`, `/staff`, `/customer-quote-response`, `/extract-*`, `/translate`, `/transcribe`) | Public | Các endpoint phục vụ giao diện Simulator 3 kênh (`/playground.html`) |
| **Dispatch Orchestrator** | `GET /api/dispatch/orders`, `POST /api/dispatch/orders/:trackingCode/action` | Protected | Theo dõi 15 trạng thái & kích hoạt xử lý đơn qua Orchestrator |
| **CRM & Orders** | `/api/crm/*`, `GET/POST/DELETE /api/orders`, `POST /api/orders/notify-ops` | Protected | Danh bạ khách Zalo, lịch sử theo phiên 24h, bật/tắt AI & quản lý đơn |
| **Config & DB** | `/api/config/*`, `/api/ops/*`, `/api/pricing/routes*`, `/api/zalo/oauth/*`, `/api/zalo/status`, `/api/db/*`, `/api/asterisk/calls` | Protected | Cấu hình động Ops/Supplier/VietQR/ZNS, OAuth PKCE & xem DB |

> *Ghi chú*: Các endpoint **Protected** chỉ yêu cầu header `x-admin-passcode` hoặc `Authorization: Bearer <ADMIN_PASSCODE>` khi biến môi trường `ADMIN_PASSCODE` khác rỗng.

---

## 📚 Tài Liệu Hướng Dẫn Dành Cho Agent & Lập Trình Viên

- 📘 **[PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)**: Bối cảnh nghiệp vụ, kiến trúc tách lớp, 15 trạng thái điều phối & schema PostgreSQL.
- 🛠️ **[INSTRUCTIONS.md](INSTRUCTIONS.md)**: Hướng dẫn kỹ thuật, bản đồ mã nguồn & quy chuẩn phát triển bắt buộc cho AI Agent và Dev Team.
- 💰 **[RAG_PRICING_ENGINE.md](RAG_PRICING_ENGINE.md)**: Bảng giá cước chuẩn, công thức quy đổi thể tích, giá gốc đối tác & biên lợi nhuận `+30% Margin`.
- 🗺️ **[ROADMAP_AUTOMATION.md](ROADMAP_AUTOMATION.md)**: Sơ đồ luồng End-to-End 2 cấp (`DCE -> CSĐT`) & Lộ trình triển khai các pha tiếp theo.
- 📞 **[ASTERISK_INTEGRATION.md](ASTERISK_INTEGRATION.md)**: Hướng dẫn cấu hình Dialplan Asterisk VoIP $\rightarrow$ Zalo OA (theo phiên 24h) & ZNS Template.
- 📊 **[DELIVERY_GUIDE_AND_TRACKER.md](DELIVERY_GUIDE_AND_TRACKER.md)**: Bản tóm tắt vận hành cho Biz Owner & Master Tracker tiến độ (đồng bộ với Google Sheet).
