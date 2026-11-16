# 📦 Đi Chung Express ShipBot (DCE_shipbot) - AI Agent CSKH & Tự Động Hóa Vận Đơn

[![Node.js CI](https://img.shields.io/badge/Node.js-v22+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Gemini API](https://img.shields.io/badge/Google%20GenAI-Gemini%20Flash-orange.svg)](https://ai.google.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Docker%20shipbot--db-336791.svg)](https://www.postgresql.org/)
[![Zalo OA](https://img.shields.io/badge/Zalo%20OA-OpenAPI%20v4-0068ff.svg)](https://developers.zalo.me/)
[![Deploy](https://img.shields.io/badge/Deploy-VPS%20Linux%20%2B%20Docker-2496ed.svg)](https://ai.dichung.vn)

Hệ thống AI Agent chăm sóc khách hàng và tự động hóa khép kín quy trình vận đơn hỏa tốc của **Đi Chung Express** (`dichung.vn` / `dichungexpress.com`), vận hành tại **[https://ai.dichung.vn](https://ai.dichung.vn)**. Hệ thống kết hợp **Google Gemini AI**, cơ sở dữ liệu **PostgreSQL (`shipbot-db`)**, giao tiếp đa kênh (**Web App, Zalo Official Account & Tổng đài Asterisk VoIP**), động cơ định giá chuẩn (**Pricing Engine**), cổng nhập giá nhanh cho **DCE Ops & Supplier**, và thanh toán tự động **VietQR**.

---

## 🌟 Điểm Nổi Bật & Tính Năng Cốt Lõi

### 1. Tiếp Nhận Đa Kênh (Zalo OA, Web App & Tổng Đài Asterisk VoIP)
- **Zalo OA & Web Chat (Progressive Disclosure)**: Thu thập thông tin tự nhiên qua từng lượt (Điểm lấy hàng $\rightarrow$ Điểm giao hàng $\rightarrow$ Thông tin hàng $\rightarrow$ Thời gian & Ghi chú), hạn chế cảm giác ngợp form.
- **Tổng đài Asterisk VoIP $\rightarrow$ Zalo OA (`ASTERISK_INTEGRATION.md`)**: Khi khách gọi Hotline, Asterisk phát lời chào IVR thu sẵn, bắn webhook `CallerID` sang `/api/asterisk/incoming-call` rồi cúp máy. ShipBot tự động nhắn tin chào từ Zalo OA (qua OA CS API hoặc ZNS Template) tới SĐT vừa gọi để khởi động luồng lên đơn.
- **Dịch ngược địa chính thông minh (Reverse Geocoding)**: Tự động chuẩn hóa tên địa danh, tòa nhà, KĐT, bệnh viện, trường học, link Google Maps hoặc tọa độ sang địa chỉ đầy đủ cấp **Phường/Xã, Quận/Huyện, Tỉnh/Thành phố** dựa trên `src/data/vnAdministrative.ts`.

### 2. Phiếu Vận Đơn Trực Quan (Interactive Waybill Card)
- Sinh mã vận đơn tự động theo chuẩn **`VN-LOG-DDMM-XXXX`**.
- Giao diện trực quan cập nhật tiến độ điền đơn theo thời gian thực (0% $\rightarrow$ 100%).
- Hỗ trợ chỉnh sửa nhanh, sao chép mẫu chuẩn gửi Zalo/SMS, và lưu trữ đồng bộ vào PostgreSQL.

### 3. Động Cơ Tính Giá Chuẩn (Rule-based & RAG Pricing Engine)
- Tự động bóc tách Tỉnh/Thành phố 2 đầu và tính **Trọng lượng quy đổi** theo chuẩn Đường bộ ($D \times R \times C / 5000$) và Đường bay ($D \times R \times C / 6000$).
- Tự động nhận diện phụ phí (ngõ hẹp `+30.000đ`, bốc xếp hàng nặng `>30kg` `+50.000đ`, hẹn giờ chính xác `+30.000đ`), áp dụng biên lợi nhuận **+30% Margin** và tính sẵn giá ưu đãi giảm 10% cho thương lượng.
- Lưu trữ & quản trị bảng giá tuyến cố định trong bảng `standard_price_routes` trên PostgreSQL.

### 4. Điều Phối Báo Giá Ngoại Lệ (DCE Ops & Default Supplier)
- Khi đơn chưa có trong bảng giá chuẩn (`hasStandardPrice === false`), hệ thống tự động đẩy yêu cầu báo giá song song qua Zalo tới **DCE Ops** (mặc định `0934691766`) và **Nhà cung cấp mặc định** (mặc định `Dichung Express` - `0906106066`). Toàn bộ tên và số Zalo đều cấu hình động ngay trên giao diện Web UI (`Zalo OA` Modal).
- **Cổng Nhập Giá Nhanh (`/quote/:trackingCode`)**: Giao diện mobile 1-Click để Ops/Supplier nhập giá gốc, xem trước giá +30% Margin và gửi thẳng báo giá lại cho Khách hàng qua Zalo OA.
- **Phản hồi trực tiếp qua chat Zalo**: Hỗ trợ cú pháp `#baogia <MÃ_ĐƠN> <GIÁ>` (VD: `#baogia 8191 450k`).

### 5. Chốt Đơn, Thanh Toán VietQR & Điều Phối Lấy Hàng
- Gửi phiếu xác nhận đơn hàng hoàn chỉnh (Thông tin khách hàng, chi tiết hàng hóa, giá cước) để khách chốt đơn.
- **Cổng Thanh Toán VietQR Động (`/pay/:trackingCode`)**: Sinh mã QR chuyển khoản đúng số tiền + nội dung mã vận đơn, hỗ trợ Webhook đối soát tự động (`/api/payment/vietqr-webhook`) từ SePAY / Casso hoặc chọn thanh toán COD.

### 6. Đồng Bộ Cơ Sở Dữ Liệu Vĩnh Viễn (PostgreSQL `shipbot-db` trên VPS)
- **`shipping_orders`**: Lưu trữ lịch sử đơn hàng, trạng thái báo giá (`quoting`, `quoted`), thanh toán (`PAID`, `COD_PENDING`) và điều phối.
- **`standard_price_routes`**: Lưu trữ cấu hình bảng giá chuẩn các tuyến vận chuyển.
- **`bot_settings`**: Lưu trữ cấu hình động (DCE Ops, Default Supplier, Payment VietQR, Asterisk/ZNS).
- **`asterisk_call_logs`**: Nhật ký cuộc gọi từ tổng đài Asterisk chuyển sang Zalo OA.
- **`zalo_auth`**, **`zalo_sessions`**, **`crm_customers`**, **`crm_messages`**: Lưu Token PKCE vĩnh viễn (tự động refresh ở mốc 18h), ngữ cảnh hội thoại và dữ liệu CRM 2 chiều.

---

## 🏗️ Kiến Trúc Công Nghệ (Tech Stack)

```text
┌────────────────────────────────────────────────────────────────────────┐
│                       TIẾP NHẬN & GIAO DIỆN ĐA KÊNH                    │
│   • Web App: React 19 + TypeScript + Vite + Tailwind CSS + Lucide Icons│
│   • Zalo OA: Khách hàng, DCE Ops (#ops), Default Supplier (#supplier)  │
│   • Tổng đài Asterisk VoIP: IVR chào & đẩy CallerID sang Webhook       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST & Webhook (HTTPS)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   NODE.JS / EXPRESS BACKEND (PORT 2700)                │
│   • server.ts (Express Server, Trust Proxy, Mobile Portals /quote,/pay)│
│   • Pipeline AI + Reverse Geocoding + Pricing Engine (pricingEngine.ts)│
│   • Google Gemini API (@google/genai SDK)                              │
│   • Zalo OA OpenAPI v4 (PKCE OAuth, ZNS, Webhook, Proactive Refresh)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ pg (Connection Pool)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             POSTGRESQL DATABASE (Docker Container: shipbot-db)         │
│   • shipping_orders   • standard_price_routes   • bot_settings         │
│   • zalo_auth         • zalo_sessions           • asterisk_call_logs   │
│   • crm_customers     • crm_messages            • /api/db/overview     │
└────────────────────────────────────────────────────────────────────────┘
```

- **Backend Runtime**: Node.js v22+ với TypeScript (`tsx`) & Express.
- **Frontend SPA**: React 19, Vite, Tailwind CSS v4, Lucide React Icons.
- **AI Engine**: Google Gemini API (`@google/genai`).
- **Database**: PostgreSQL chạy qua Docker (`shipbot-db`).
- **Hosting / Deploy**: **VPS Linux** (`https://ai.dichung.vn`, port nội bộ `2700`) đóng gói bằng **Docker & Docker Compose** (`Dockerfile`, `docker-compose.yml`), tự động hóa build image & deploy qua **GitHub Actions CI/CD** (`.github/workflows/deploy.yml`).

---

## 📁 Cấu Trúc Thư Mục Dự Án

```text
DCE_shipbot/
├── README.md                      # Tài liệu tổng quan dự án (File này)
├── PROJECT_OVERVIEW.md            # Bối cảnh nghiệp vụ, quy trình 5 giai đoạn & kiến trúc tổng thể
├── INSTRUCTIONS.md                # Hướng dẫn chi tiết cho AI Agent tiếp tục phát triển
├── RAG_PRICING_ENGINE.md          # Đặc tả công thức tính giá RAG, quy đổi thể tích & bảng giá
├── ROADMAP_AUTOMATION.md          # Lộ trình tự động hóa 4 giai đoạn & Sơ đồ luồng vận hành
├── ASTERISK_INTEGRATION.md        # Hướng dẫn cấu hình Dialplan Asterisk VoIP -> Zalo OA & ZNS
├── Dockerfile                     # Đóng gói ứng dụng Node.js + Vite build cho Docker
├── docker-compose.yml             # Cấu hình chạy container App & PostgreSQL trên VPS
├── .github/workflows/deploy.yml   # Pipeline CI/CD tự động build image & deploy lên VPS
├── server.ts                      # Server Express chính: AI, Pricing, Zalo OA, Asterisk, VietQR, DB
├── package.json                   # Cấu hình dependency & scripts
├── tsconfig.json                  # Cấu hình TypeScript
├── vite.config.ts                 # Cấu hình Vite build
├── index.html                     # Entry HTML giao diện Web
└── src/
    ├── App.tsx                    # Component gốc: Quản lý state hội thoại, phiếu đơn, modals
    ├── main.tsx                   # React DOM Entrypoint
    ├── types.ts                   # Định nghĩa TypeScript interfaces (ShippingInfo, OrderRecord, RoutingConfig)
    ├── index.css                  # Tailwind styles
    ├── data/
    │   └── vnAdministrative.ts    # Từ điển & hàm chuẩn hóa địa chính 63 tỉnh thành Việt Nam
    ├── utils/
    │   ├── logistics.ts           # Tiện ích logistics: sinh mã đơn, format tóm tắt, thông báo Ops
    │   └── pricingEngine.ts       # Động cơ tính cước chuẩn, quy đổi thể tích & phụ phí
    └── components/
        ├── Header.tsx             # Thanh điều hướng: Trạng thái Zalo, CRM, Lịch sử, Tạo đơn mới
        ├── ChatPanel.tsx          # Khung chat tương tác với bot (giọng nói, tin nhắn nhanh)
        ├── WaybillCard.tsx        # Phiếu vận đơn trực quan & hiển thị tính cước Pricing Engine
        ├── OrderHistoryModal.tsx  # Modal lịch sử đơn hàng, trạng thái báo giá & link /quote
        ├── ZaloStatusModal.tsx    # Bảng điều khiển Zalo OA, PKCE, cấu hình Ops/Supplier/VietQR/Asterisk
        ├── CrmModal.tsx           # Bảng quản lý khách hàng Zalo OA & nhắn tin trực tiếp
        ├── SamplePromptsModal.tsx # Kịch bản mẫu thử nghiệm
        └── SuccessOrderModal.tsx  # Modal thông báo xác nhận lên đơn & nút bắn Zalo Ops
```

---

## ⚙️ Biến Môi Trường (.env)

Tạo file `.env` tại thư mục gốc của dự án (tham khảo [`.env.example`](.env.example)):

```ini
# --- SERVER & RUNTIME ---
PORT=2700
NODE_ENV=production
APP_URL="https://ai.dichung.vn"
PUBLIC_BASE_URL="https://ai.dichung.vn"

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

## 🚀 Hướng Dẫn Cài Đặt & Triển Khai

### 1. Chạy ở môi trường Local

```bash
# 1. Clone repository
git clone https://github.com/hoang-ama/DCE_shipbot.git
cd DCE_shipbot

# 2. Cài đặt các thư viện Node.js
npm install

# 3. Tạo file cấu hình môi trường
cp .env.example .env
# Chỉnh sửa file .env và điền GEMINI_API_KEY, DATABASE_URL cùng các thông số cần thiết

# 4. Chạy ở chế độ Development (Vite HMR + Express server)
npm run dev

# 5. Mở trình duyệt truy cập: http://localhost:2700
```

### 2. Kiểm tra TypeScript & Build Production

```bash
# Kiểm tra lỗi TypeScript
npm run lint

# Build production bundle
npm run build

# Khởi chạy server production
npm start
```

### 3. Triển khai trên VPS Linux (`https://ai.dichung.vn`) với Docker & CI/CD

1. **Docker Compose trên VPS**:
   - Đã cấu hình sẵn trong `Dockerfile` và `docker-compose.yml` để chạy ứng dụng (`port 2700`) kết nối PostgreSQL container.
   - Reverse Proxy (Nginx / Caddy) trên VPS trỏ domain **`https://ai.dichung.vn`** vào `http://127.0.0.1:2700`.
2. **Tự động hóa CI/CD (GitHub Actions)**:
   - Mỗi lần push code lên nhánh `main`, workflow `.github/workflows/deploy.yml` tự động chạy `npm ci` $\rightarrow$ `npm run lint` $\rightarrow$ Build & Push Docker Image lên GHCR $\rightarrow$ SSH vào VPS thực hiện `docker compose pull app && docker compose up -d --no-deps app`.
3. **Cấu hình Webhook & OAuth trên Zalo For Developers**:
   - Callback URL: `https://ai.dichung.vn/api/zalo/oauth/callback`
   - Webhook URL: `https://ai.dichung.vn/api/zalo/webhook`
4. **Cấu hình Tổng đài Asterisk VoIP**:
   - Trỏ Inbound Route gọi webhook tới `https://ai.dichung.vn/api/asterisk/incoming-call` (chi tiết trong [ASTERISK_INTEGRATION.md](ASTERISK_INTEGRATION.md)).

---

## 📡 Danh Sách REST API & Portal Endpoints Chính

| Phương thức | Endpoint | Chức năng |
| :--- | :--- | :--- |
| `POST` | `/api/chat` | Pipeline xử lý hội thoại, bóc tách vận đơn & tính cước chuẩn |
| `GET` | `/api/health` | Kiểm tra trạng thái server và Gemini API Key |
| `GET` / `POST` | `/api/orders` | Lấy danh sách hoặc tạo/cập nhật phiếu vận đơn trong PostgreSQL |
| `POST` | `/api/orders/notify-ops` | Đẩy thông tin đơn hàng tới Zalo DCE Ops & Default Supplier |
| `GET` | `/quote/:trackingCode` | Cổng Nhập Giá Nhanh (Quick Quote Portal) trên mobile cho Ops/Supplier |
| `POST` | `/api/orders/:trackingCode/quote` | Lưu báo giá ngoại lệ & tự động gửi giá lại cho Khách qua Zalo OA |
| `GET` | `/pay/:trackingCode` | Cổng Thanh Toán VietQR động cho Khách hàng |
| `POST` | `/api/orders/:trackingCode/payment` | Xác nhận phương thức thanh toán (VietQR / COD) |
| `POST` | `/api/payment/vietqr-webhook` | Webhook đối soát giao dịch ngân hàng (SePAY / Casso) |
| `POST` | `/api/pricing/calculate` | Tính cước chuẩn & trọng lượng quy đổi cho một đơn hàng |
| `GET` / `POST` | `/api/pricing/routes` | Xem và cập nhật danh sách tuyến trong Bảng giá chuẩn |
| `GET` / `POST` | `/api/config/routing` | Cấu hình động SĐT DCE Ops & Tên/SĐT Nhà cung cấp mặc định |
| `GET` / `POST` | `/api/config/payment` | Cấu hình tài khoản ngân hàng nhận VietQR |
| `GET` / `POST` | `/api/config/asterisk` | Cấu hình Tổng đài Asterisk & Zalo ZNS Template ID |
| `POST` | `/api/asterisk/incoming-call` | Webhook tiếp nhận `CallerID` từ Asterisk & gửi tin chào Zalo OA |
| `GET` | `/api/asterisk/calls` | Xem nhật ký cuộc gọi từ Asterisk sang Zalo OA |
| `GET` | `/api/zalo/status` | Kiểm tra trạng thái kết nối Zalo OA, Ops, Supplier & logs |
| `GET` | `/api/zalo/oauth/login` | Bắt đầu ủy quyền Zalo OA 1-Click với chuẩn PKCE |
| `GET` | `/api/zalo/oauth/callback` | Callback nhận code và đổi Token Zalo tự động |
| `POST` | `/api/zalo/webhook` | Webhook tiếp nhận tin nhắn khách hàng & lệnh `#ops`, `#supplier`, `#baogia` |
| `GET` / `POST` | `/api/crm/customers` | Quản lý danh bạ khách hàng Zalo OA & nhắn tin trực tiếp |
| `GET` | `/api/db/overview` | Xem trực tiếp thống kê và dữ liệu các bảng trong PostgreSQL |

---

## 📚 Tài Liệu Hướng Dẫn Dành Cho Agent & Lập Trình Viên

- 📘 **[PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)**: Tổng quan dự án, kịch bản 5 giai đoạn & kiến trúc tổng thể.
- 🛠️ **[INSTRUCTIONS.md](INSTRUCTIONS.md)**: Hướng dẫn kỹ thuật và quy chuẩn phát triển cho AI Agent.
- 💰 **[RAG_PRICING_ENGINE.md](RAG_PRICING_ENGINE.md)**: Bảng giá cước chuẩn, công thức quy đổi thể tích & biên lợi nhuận +30%.
- 🗺️ **[ROADMAP_AUTOMATION.md](ROADMAP_AUTOMATION.md)**: Sơ đồ luồng vận hành toàn diện & Lộ trình tự động hóa 4 giai đoạn.
- 📞 **[ASTERISK_INTEGRATION.md](ASTERISK_INTEGRATION.md)**: Hướng dẫn cấu hình Dialplan Asterisk VoIP $\rightarrow$ Zalo OA & ZNS Template.
