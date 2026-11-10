# 📦 Đi Chung Express ShipBot (DCE_shipbot) - AI Agent CSKH & Tự Động Hóa Vận Đơn

[![Node.js CI](https://img.shields.io/badge/Node.js-v20+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Gemini API](https://img.shields.io/badge/Google%20GenAI-Gemini%203.8%20Flash-orange.svg)](https://ai.google.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Render%20shipbot--db-336791.svg)](https://www.postgresql.org/)
[![Zalo OA](https://img.shields.io/badge/Zalo%20OA-OpenAPI%20v4-0068ff.svg)](https://developers.zalo.me/)

Hệ thống AI Agent chăm sóc khách hàng và tự động hóa điều phối đơn hàng vận chuyển hỏa tốc của **Đi Chung Express** (`dichung.vn` / `dichungexpress.com`). Hệ thống kết hợp giữa mô hình ngôn ngữ lớn **Google Gemini 3.8 Flash**, cơ sở dữ liệu **PostgreSQL (`shipbot-db`)**, kênh giao tiếp đa nền tảng (**Web App tương tác trực quan & Zalo Official Account**), và động cơ bóc tách địa chính 63 tỉnh thành Việt Nam theo kịch bản tư vấn tự nhiên 5 giai đoạn (**Progressive Disclosure**).

---

## 🌟 Điểm Nổi Bật & Tính Năng Cốt Lõi

### 1. Kịch Bản Tư Vấn Tự Nhiên & Dịch Ngược Địa Chính (Progressive Disclosure)
- **Hạn chế cảm giác "ngợp form"**: Thu thập thông tin theo luồng tự nhiên qua từng lượt trao đổi (Điểm lấy hàng $\rightarrow$ Điểm giao hàng $\rightarrow$ Thông tin hàng $\rightarrow$ Thời gian & Ghi chú).
- **Dịch ngược địa chính thông minh (Reverse Geocoding)**: Tự động nhận diện và dịch ngược từ tên địa danh, tòa nhà, khu đô thị, TTTM, bệnh viện, trường học, bến xe, link Google Maps, hoặc tọa độ sang địa chỉ chuẩn mực cấp **Phường/Xã, Quận/Huyện, Tỉnh/Thành phố** (dựa trên từ điển địa chính 63 tỉnh thành `src/data/vnAdministrative.ts`).
- **Phân loại hàng hóa chuẩn logistics**: Tự động ánh xạ tên mặt hàng (ví dụ: *sầu riêng, cherry* $\rightarrow$ *Hoa quả*; *hồ sơ, chứng từ* $\rightarrow$ *Tài liệu*; *tôm, mực* $\rightarrow$ *Hải sản*). Yêu cầu đạt tối thiểu **2/3 trường** (Tên loại hàng, Khối lượng kg, Kích thước) mới xác nhận.
- **Xác nhận đơn form chuẩn**: Tự động gom thông tin và xác nhận bằng form chuẩn hóa 4 dòng trước khi báo giá.

### 2. Phiếu Vận Đơn Trực Quan (Interactive Waybill Card)
- Sinh mã vận đơn tự động theo chuẩn **`VN-LOG-DDMM-XXXX`**.
- Giao diện trực quan cập nhật tiến độ điền đơn theo thời gian thực (0% $\rightarrow$ 100%).
- Hỗ trợ xem nhanh, sửa thông tin thủ công, sao chép văn bản chuẩn gửi Zalo/SMS, và lưu trữ vào hệ thống.

### 3. Đồng Bộ Cơ Sở Dữ Liệu Vĩnh Viễn (PostgreSQL `shipbot-db` trên Render)
- **`shipping_orders`**: Lưu trữ toàn bộ lịch sử đơn hàng từ Web App và Zalo OA, tìm kiếm, khôi phục phiếu và đồng bộ đa thiết bị.
- **`zalo_auth`**: Lưu trữ an toàn `access_token` và `refresh_token` Zalo OA, tự động khôi phục khi server khởi động lại.
- **`crm_customers`**: Quản lý danh bạ khách hàng Zalo (Họ tên, SĐT, địa chỉ, số đơn đã tạo, lần tương tác cuối).
- **`crm_messages`**: Lưu trữ lịch sử tin nhắn 2 chiều giữa khách hàng, Bot AI và tư vấn viên.
- **`zalo_sessions`**: Lưu trữ ngữ cảnh phiên chat của khách hàng trong vòng 6 giờ, chống mất thông tin khi deploy lại server.
- **Tra cứu tổng quan DB**: Truy cập trực tiếp endpoint `/api/db/overview` để kiểm tra trạng thái bảng và dữ liệu.

### 4. Kết Nối Zalo Official Account & Ủy Quyền 1-Click PKCE
- **Webhook 2 chiều**: Tiếp nhận tin nhắn webhook từ Zalo OA, chạy cùng pipeline xử lý AI và phản hồi tin nhắn tự động.
- **Ủy quyền 1-Click OAuth v4 với PKCE**: Tự động sinh `code_verifier` và `code_challenge` SHA-256 Base64URL, giúp cấp quyền chỉ với 1 cú click chuột mà không cần copy token thủ công từ Zalo API Explorer.
- **Tự động làm mới chủ động (Proactive Refresh)**: Tự động kiểm tra mỗi 30 phút và làm mới Access Token ở mốc 18 giờ (trước thời hạn 25 giờ của Zalo).
- **Hỗ trợ tư vấn viên can thiệp (Human Handover)**: Giao diện CRM Drawer cho phép tư vấn viên gửi tin nhắn trực tiếp tới khách hàng trên Zalo OA.

### 5. Định Hướng RAG Pricing Engine (+30% Margin) & DC Hub Portal
- Tích hợp công thức tính thể tích quy đổi: Đường bay (`/6000`), Đường bộ (`/5000`).
- Áp dụng biên lợi nhuận +30% trên giá gốc đối tác.
- Chuẩn hóa payload JSON sẵn sàng bắn API Lead sang DC Hub Portal (`portal.dichung.vn`).

---

## 🏗️ Kiến Trúc Công Nghệ (Tech Stack)

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          GIAO DIỆN NGƯỜI DÙNG                          │
│   • Web App: React 19 + TypeScript + Vite + Tailwind CSS + Lucide Icons│
│   • Khách hàng Zalo OA: Ứng dụng Zalo trên di động / máy tính          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST & Webhook
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        NODE.JS / EXPRESS BACKEND                       │
│   • server.ts (Express Server, Trust Proxy, Keepalive)                 │
│   • Pipeline Xử Lý Đa Tầng (Fast Rule Evaluator + Reverse Geocoding)   │
│   • Google Gemini 3.8 Flash (@google/genai SDK)                        │
│   • Zalo OA OpenAPI v4 (PKCE OAuth, Webhook Listener, Proactive Cron)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ pg (Connection Pool + SSL bypass)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               POSTGRESQL DATABASE (Render: shipbot-db)                 │
│   • zalo_auth        • shipping_orders   • crm_customers               │
│   • crm_messages     • zalo_sessions     • /api/db/overview            │
└────────────────────────────────────────────────────────────────────────┘
```

- **Backend Runtime**: Node.js v20+ với TypeScript & Express.
- **Frontend SPA**: React 19, Vite, Tailwind CSS v4, Lucide React Icons.
- **AI Engine**: Google Gemini API (`@google/genai`, model `gemini-2.5-flash` / `gemini-3.8-flash`).
- **Database**: PostgreSQL (`pg` Client Pool) lưu trữ trên Render Cloud (`shipbot-db`).
- **Hosting / Deploy**: Render Cloud Web Service (`https://dce-shipbot.onrender.com`).

---

## 📁 Cấu Trúc Thư Mục Dự Án

```text
DCE_shipbot/
├── README.md                      # Tài liệu tổng quan dự án (File này)
├── PROJECT_OVERVIEW.md            # Bối cảnh nghiệp vụ, quy trình 5 giai đoạn & kiến trúc chi tiết
├── INSTRUCTIONS.md                # Hướng dẫn chi tiết cho Antigravity AI Agent tiếp tục code
├── RAG_PRICING_ENGINE.md          # Đặc tả công thức tính giá RAG, quy đổi thể tích & bảng giá
├── server.ts                      # Server Express chính: AI Pipeline, Zalo OA Webhook, DB, CRM, API
├── package.json                   # Cấu hình dependency & scripts
├── tsconfig.json                  # Cấu hình TypeScript
├── vite.config.ts                 # Cấu hình Vite build
├── index.html                     # Entry HTML giao diện Web
├── src/
│   ├── App.tsx                    # Component gốc: Quản lý state hội thoại, phiếu đơn, modals
│   ├── main.tsx                   # React DOM Entrypoint
│   ├── types.ts                   # Định nghĩa TypeScript interfaces (ShippingInfo, OrderRecord, CRM)
│   ├── index.css                  # Tailwind styles
│   ├── data/
│   │   └── vnAdministrative.ts   # Từ điển & hàm chuẩn hóa địa chính 63 tỉnh thành Việt Nam
│   ├── utils/
│   │   └── logistics.ts          # Tiện ích logistics: sinh mã đơn, format tiền tệ, bóc tách tóm tắt
│   └── components/
│       ├── Header.tsx             # Thanh điều hướng: Trạng thái Zalo, CRM, Lịch sử, Tạo đơn mới
│       ├── ChatPanel.tsx          # Khung chat tương tác với bot (giọng nói, tin nhắn nhanh)
│       ├── WaybillCard.tsx        # Phiếu vận đơn trực quan 4 trường thông tin
│       ├── OrderHistoryModal.tsx  # Modal lịch sử đơn hàng (đồng bộ PostgreSQL shipbot-db)
│       ├── ZaloStatusModal.tsx    # Bảng điều khiển Zalo OA, 1-Click PKCE, cập nhật token, logs
│       ├── CrmModal.tsx           # Bảng quản lý khách hàng Zalo OA & nhắn tin trực tiếp
│       ├── SamplePromptsModal.tsx # Kịch bản mẫu thử nghiệm
│       └── SuccessOrderModal.tsx  # Modal thông báo xác nhận lên đơn thành công
└── REF. DOC/                      # Tài liệu tham khảo gốc từ nguyên mẫu trước
```

---

## ⚙️ Biến Môi Trường (.env)

Tạo file `.env` tại thư mục gốc của dự án:

```ini
# Cổng chạy ứng dụng
PORT=3000
NODE_ENV=production

# Google Gemini API Key
GEMINI_API_KEY=your_gemini_api_key_here

# Kết nối PostgreSQL (Render shipbot-db)
# Sử dụng Internal DB URL khi chạy trên Render, hoặc External DB URL khi chạy Local
DATABASE_URL=postgresql://shipbot_db_u82u_user:password@dpg-dbo7fibm8hqs73fp3m90-a.singapore-postgres.render.com/shipbot_db_u82u?ssl=true

# Cấu hình Zalo Official Account (App ID & Secret Key từ developers.zalo.me)
ZALO_APP_ID=4541345519906352744
ZALO_APP_SECRET=your_zalo_app_secret_here

# Token Zalo OA (Sẽ tự động cập nhật và lưu trữ vào PostgreSQL)
ZALO_OA_ACCESS_TOKEN=
ZALO_REFRESH_TOKEN=

# URL triển khai Render (Dùng cho Webhook & Keepalive)
RENDER_EXTERNAL_URL=https://dce-shipbot.onrender.com
```

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Ứng Dụng

### 1. Chạy ở môi trường Local

```bash
# 1. Clone repository
git clone https://github.com/hoang-ama/DCE_shipbot.git
cd DCE_shipbot

# 2. Cài đặt các thư viện Node.js
npm install

# 3. Tạo file cấu hình môi trường
cp .env.example .env
# Chỉnh sửa file .env và điền GEMINI_API_KEY cùng các thông số cần thiết

# 4. Chạy ở chế độ Development (Vite HMR + Express server)
npm run dev

# 5. Mở trình duyệt truy cập:
# http://localhost:3000
```

### 2. Build & Kiểm tra Typescript

```bash
# Kiểm tra lỗi Typescript
npx tsc --noEmit

# Build production bundle
npm run build

# Khởi chạy server production
npm start
```

### 3. Triển khai lên Render Cloud

1. Kết nối repository GitHub `hoang-ama/DCE_shipbot` với **Web Service** trên [Render Dashboard](https://dashboard.render.com).
2. Cấu hình dịch vụ:
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
3. Thêm các biến môi trường trong tab **Environment**:
   - `GEMINI_API_KEY`
   - `DATABASE_URL` (Sử dụng chuỗi Internal Database URL từ database `shipbot-db`)
   - `ZALO_APP_ID` & `ZALO_APP_SECRET`
4. Cấu hình Callback URL trên **Zalo For Developers**:
   - Truy cập [Zalo Developers](https://developers.zalo.me/) $\rightarrow$ Chọn ứng dụng $\rightarrow$ **Cài đặt** $\rightarrow$ **Đăng nhập bằng Zalo / Official Account**.
   - Dán Callback URL: `https://dce-shipbot.onrender.com/api/zalo/oauth/callback`.
   - Dán Webhook URL: `https://dce-shipbot.onrender.com/api/zalo/webhook`.

---

## 📡 Danh Sách REST API Endpoints Chính

| Phương thức | Endpoint | Chức năng |
| :--- | :--- | :--- |
| `POST` | `/api/chat` | Pipeline xử lý hội thoại và bóc tách thông tin vận đơn |
| `GET` | `/api/health` | Kiểm tra trạng thái server và Gemini API Key |
| `GET` | `/api/orders` | Lấy danh sách phiếu vận đơn lưu trữ trong PostgreSQL |
| `POST` | `/api/orders` | Lưu hoặc cập nhật phiếu vận đơn vào PostgreSQL |
| `DELETE`| `/api/orders/:id` | Xóa 1 phiếu vận đơn khỏi PostgreSQL |
| `DELETE`| `/api/orders` | Xóa toàn bộ lịch sử đơn hàng |
| `GET` | `/api/zalo/status` | Kiểm tra trạng thái kết nối Token Zalo OA & logs |
| `GET` | `/api/zalo/oauth/login` | Bắt đầu ủy quyền Zalo OA 1-Click với chuẩn PKCE |
| `GET` | `/api/zalo/oauth/callback`| Callback nhận code và đổi Token Zalo tự động |
| `POST` | `/api/zalo/webhook` | Webhook tiếp nhận tin nhắn từ Zalo OA |
| `POST` | `/api/zalo/update-token` | Cập nhật token thủ công từ giao diện Web |
| `POST` | `/api/zalo/refresh-now` | Ép buộc làm mới token ngay lập tức bằng refresh token |
| `GET` | `/api/crm/customers` | Lấy danh bạ khách hàng tương tác qua Zalo OA |
| `GET` | `/api/crm/customers/:userId/messages` | Lấy toàn bộ lịch sử chat của khách hàng |
| `POST` | `/api/crm/send-message` | Tư vấn viên gửi tin nhắn trực tiếp tới khách Zalo |
| `GET` | `/api/db/overview` | Xem trực tiếp thống kê và dữ liệu các bảng trong Database |

---

## 📚 Tài Liệu Hướng Dẫn Dành Cho Agent & Lập Trình Viên

- 📘 **[PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)**: Tổng quan dự án, kịch bản 5 giai đoạn & kiến trúc tổng thể.
- 🛠️ **[INSTRUCTIONS.md](INSTRUCTIONS.md)**: Hướng dẫn kỹ thuật và danh sách nhiệm vụ phát triển tiếp theo cho Agent.
- 💰 **[RAG_PRICING_ENGINE.md](RAG_PRICING_ENGINE.md)**: Bảng giá cước, công thức quy đổi thể tích & biên lợi nhuận +30%.
