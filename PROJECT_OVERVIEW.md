# DC EXPRESS SHIPBOT - TỔNG QUAN DỰ ÁN & KIẾN TRÚC HỆ THỐNG

## 1. TỔNG QUAN DỰ ÁN & BỐI CẢNH DOANH NGHIỆP

- **Doanh nghiệp**: Đi Chung Express (`dichung.vn` / `dichungexpress.com`).
- **Mục tiêu**: Tự động hóa toàn diện quy trình tiếp nhận nhu cầu vận chuyển, chuẩn hóa địa chỉ đến cấp Phường/Xã trên toàn quốc, định giá minh bạch (**+30% Margin** từ bảng giá chuẩn hoặc báo giá đối tác 2 cấp `DCE Ops -> CSĐT`), đồng bộ dữ liệu tập trung trên PostgreSQL (`shipbot-db`), thu thập thông tin chốt đơn / thanh toán VietQR và hoàn tất điều phối tài xế.
- **Kênh tiếp nhận & vận hành**:
  1. **Zalo Official Account (OA)**: Mặc định vào thẳng luồng chuyển phát hàng (**`express`**), áp dụng **phiên chat cố định 24h (`CHAT-DDMM-XXXX`)**, **Zalo ID Alias Handover**, và giao tiếp trực tiếp 3 bên (**Khách hàng $\leftrightarrow$ AI CSKH $\leftrightarrow$ DCE Ops Cấp 1 / CSĐT Cấp 2**).
  2. **Web App ShipBot (`/` & `/playground.html`)**: Giao diện chat đa dịch vụ (`GROUP_MENU`), Phiếu Vận Đơn thời gian thực (`WaybillCard`), **CRM Khách Zalo** (lọc phiên 24h), **Điều phối Live** (`DispatchMonitorModal`), **Simulator 3 Kênh** và cổng mobile `/quote/:code`, `/pay/:code`.
  3. **Tổng đài Asterisk VoIP (`/api/asterisk/incoming-call`)**: Nhận cuộc gọi Hotline, phát IVR hẹn nhắn qua Zalo và kích hoạt tin chào vào đúng phiên 24h của khách.

---

## 2. LUỒNG NGHIỆP VỤ END-TO-END (UNIFIED MULTI-AGENT WORKFLOW)

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│ 1. TIẾP NHẬN (intakeAgent & router.ts)                                         │
│    • Web Chat: Cho phép chọn nhóm (Chuyển người / Chuyển hàng / Du lịch)       │
│    • Zalo OA:  Mặc định vào thẳng Chuyển phát hàng (express), bỏ GROUP_MENU    │
│    • Thu 4 trường lõi: Điểm lấy, Điểm giao, Hàng hóa, Thời gian giao nhận      │
│    • Chống ghi đè: Lọc câu giục/hỏi giá; giữ phiên 24h cố định (CHAT-DDMM-XXXX)│
└───────────────────────────────────────┬────────────────────────────────────────┘
                                        │ Đủ thông tin & xác nhận tạo đơn
                                        ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ 2. ĐỊNH GIÁ & ĐIỀU PHỐI 2 CẤP (pricing/engine.ts & dispatchAgent.ts)           │
│  • Khớp Bảng giá chuẩn: Tự tính cước (+30% Margin + phụ phí) -> Gửi báo giá    │
│  • Tuyến ngoại lệ (Waterfall):                                                 │
│      [Cấp 1: DCE Ops (#ops)] --("1tr2")--> AI tự nhân +30% (= 1.560.000đ)      │
│             │                                                                  │
│      (Nếu trả lời "Không" / hết xe)                                            │
│             ▼                                                                  │
│      [Cấp 2: CSĐT (#supplier - Dichung Express)] --(giá gốc)--> AI +30% Margin │
│    • Nếu đối tác cần hỏi rõ thêm -> AI dịch chuyển câu hỏi cho Khách & ngược   │
└───────────────────────────────────────┬────────────────────────────────────────┘
                                        │ Trạng thái QUOTED_WAITING_CUSTOMER
                                        ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ 3. CHỐT ĐƠN, THU THẬP 4 BƯỚC & VIETQR SONG SONG (closingAgent & coordinator)   │
│  • Khách từ chối (DECLINE) -> Đóng CUSTOMER_DECLINED                           │
│  • Khách thương lượng -> Áp dụng giảm 10% (1 lần, >= giá gốc * 1.1)            │
│  • Khách hỏi thêm (ASK_INFO) -> Dịch & chuyển tiếp cho đúng DCE / CSĐT         │
│  • Khách chốt (ACCEPT) -> Thu tuần tự 4 bước:                                  │
│      1) SĐT người nhận  ->  2) SĐT người gửi                                   │
│      3) Bên trả cước (Người gửi / Người nhận)                                  │
│      4) Thời điểm trả (Lúc gửi hàng / Sau khi nhận hàng)                       │
└───────────────────────────────────────┬────────────────────────────────────────┘
                                        │ Hoàn tất 4 bước sau chốt
                                        ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ 4. ĐIỀU XE & THANH TOÁN SONG SONG -> COMPLETED                                 │
│  • Gửi đủ thông tin + SĐT 2 đầu sang DCE / CSĐT xin SĐT Tài xế                 │
│  • Nếu chọn "Thanh toán lúc gửi hàng": Gửi song song link VietQR /pay/:code    │
│    cho Khách (vẫn hỗ trợ chuyển sang COD nếu cần)                              │
│  • Đối tác nhắn SĐT Tài xế -> Bot gửi SĐT Tài xế cho Khách -> COMPLETED        │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. DỊCH NGƯỢC ĐỊA CHÍNH & CHỐNG GHI ĐÈ DỮ LIỆU

Logic bóc tách và bảo vệ dữ liệu tập trung tại [`src/chatbot/extraction/express.ts`](src/chatbot/extraction/express.ts), [`src/chatbot/validation/field-check.ts`](src/chatbot/validation/field-check.ts) và [`src/shared/data/vnAdministrative.ts`](src/shared/data/vnAdministrative.ts):

1. **Dịch ngược địa danh, tòa nhà, KĐT & Google Maps**:
   - Địa danh nổi tiếng (*Keangnam, Landmark 81, Royal City, Times City, KĐT PG An Đồng...*) và link/tọa độ Google Maps được dịch ngược sang địa chỉ hành chính có **Phường/Xã, Quận/Huyện, Tỉnh/Thành phố** (`hasWardCommune: true`).
2. **Quy tắc hàng hóa (2/3 tiêu chí)** & **Phân tách thời gian**:
   - Đạt tối thiểu **2 trên 3 thông tin**: Loại hàng, Khối lượng (kg), Kích thước (cm).
   - Các cụm thời gian (*"hỏa tốc trong ngày"*, *"sáng mai"*, *"15h"*) tách riêng vào `deliveryTime`, không gán vào địa chỉ.
3. **Chống ghi đè thông tin (Anti-Overwrite / Anti-Chatter)**:
   - Các hàm `isConversationalOrQuestion`, `hasExplicitAddressSignal`, `isNotValidAddress` và `isUserCorrectionMessage` chặn tình huống câu hỏi (*"Ng nhận trả phí ship được k ạ"*) hoặc câu giục (*"Nhanh giúp E vs"*) bị ghi đè làm mất địa chỉ giao/lấy hàng đã thu trước đó.

---

## 4. KIẾN TRÚC TÁCH LAYER TOÀN HỆ THỐNG

```text
server.ts (HTTP Entrypoint, /api/chat, /api/zalo/webhook, /api/dispatch, Static dist/)
│
├── src/config/ & src/shared/
│   ├── env.ts, runtime.ts         # Cấu hình cổng 2700, HOST=0.0.0.0, ADMIN_PASSCODE
│   ├── access-guard.ts            # Bảo vệ endpoint nhạy cảm (khi ADMIN_PASSCODE != "")
│   └── service-menu.ts            # GROUP_MENU (chỉ bật cho kênh Web)
│
├── src/chatbot/agents/ (AI Multi-Agent Layer - dùng chung Web/Zalo & Simulator)
│   ├── intakeAgent.ts             # Form 4 trường, dịch làm rõ, SĐT, bên trả, thời điểm TT
│   ├── dispatchAgent.ts           # Intent đối tác (QUOTE/NEED_MORE_INFO/REJECT), +30% Margin
│   ├── closingAgent.ts            # Quyết định khách (ACCEPT/DECLINE/ASK_INFO), -10%, link VietQR
│   └── mediaAgent.ts              # Chuẩn hóa viết tắt (1tr2/500k), dịch thuật & STT giọng nói
│
├── src/orchestrator/ (Master 15-State Coordinator)
│   ├── stateMachine.ts            # 15 trạng thái, allowed transitions, order_dispatch_threads
│   ├── coordinator.ts             # Xử lý phản hồi Khách <-> DCE Ops <-> CSĐT trên Zalo & API
│   └── routes.ts                  # /api/dispatch/orders & /api/dispatch/orders/:code/action
│
└── src/modules/ (Server Modules độc lập)
    ├── conversation/ & handover/  # Phiên 24h cố định (CHAT-DDMM-XXXX) & Handover đa ID alias
    ├── zalo/                      # OAuth PKCE, Refresh 18h, Sender (+messageId), Events
    ├── customer/ & booking/       # CRM khách hàng 24h & Lưu trữ đơn hàng PostgreSQL
    ├── pricing/ & supplier/       # Bảng giá chuẩn, Portal /quote, điều phối #ops/#supplier
    └── payment/ & asterisk/       # VietQR Portal /pay, SePay/Casso Webhook, Asterisk ZNS
```

---

## 5. THIẾT KẾ CƠ SỞ DỮ LIỆU POSTGRESQL (`shipbot-db`)

Schema được quản lý tập trung tại [`src/database/migrations/001_express.sql`](src/database/migrations/001_express.sql) và tự đồng bộ khi khởi động qua [`src/database/bootstrap.ts`](src/database/bootstrap.ts):

1. **`shipping_orders`**: Lưu toàn bộ đơn vận chuyển kèm trạng thái điều phối (`workflow_state`, `assigned_partner`, `chat_session_id`, `base_cost_vnd`, `customer_quote_vnd`, `quoted_by`, `quote_note`, `payment_method`, `payment_status`, `payment_party`, `payment_timing`, `driver_phone`, `negotiation_used`, `additional_info`, `shipping_info` JSONB).
2. **`order_dispatch_threads`**: Lưu ánh xạ tin nhắn gửi tới DCE/CSĐT (`tracking_code`, `partner_role`, `partner_user_id`, `zalo_msg_id`, `expected_state`) để khớp chính xác khi đối tác **Quote-Reply** giữa nhiều đơn chờ.
3. **`crm_customers`**: Hồ sơ khách hàng Zalo OA kèm cờ `human_takeover`, `current_session_id`, `session_started_at` (theo dõi cửa sổ 24h cố định).
4. **`crm_messages`**: Lịch sử chat 2 chiều (`user`, `bot`, `agent`) gắn với `session_id` để lọc hội thoại theo từng phiên trên Web CRM.
5. **`zalo_sessions`**: Lưu trạng thái phiên hội thoại (tự động bỏ qua các phiên quá 24h khi server khởi động lại).
6. **`zalo_auth`**, **`standard_price_routes`**, **`bot_settings`**, **`asterisk_call_logs`**: Lưu Zalo OAuth token, bảng giá tuyến cố định, cấu hình động Ops/Supplier/Bank/ZNS và nhật ký cuộc gọi Asterisk.

---

## 6. CƠ CHẾ PHỐI HỢP NGƯỜI THẬT (HUMAN-IN-THE-LOOP 24H)

1. **Dừng AI tự động trong 24h khi Ops tham gia**: Bất kỳ khi nào nhân viên gửi tin từ app Zalo OA (`oa_send_*`, ngoại trừ echo tin bot vừa gửi) hoặc qua giao diện Web CRM, hệ thống bật `humanTakeover = true` trên toàn bộ các ID Zalo liên kết (`user_id_by_app`, `sender.id`, `recipient.id`) cho trọn phiên 24h hiện tại.
2. **Bật lại AI thủ công**: Nhắn `#bot` hoặc `#ai` trong cuộc chat OA, hoặc bấm nút **"Đang dừng AI (Bật lại AI)"** trong `CrmModal` trên Web UI.
3. **Tự reset sang phiên mới sau 24h**: Quá mốc 24h cố định tính từ lúc mở phiên (`CHAT_SESSION_TTL_MS = 24h`), tin nhắn tiếp theo của khách tự động mở một `sessionId` mới (`CHAT-DDMM-XXXX`) và trả quyền tiếp nhận lại cho AI.
4. **Điều phối Live & Simulator**: Nhân viên có thể mở **Điều phối Live** trên Web UI để theo dõi 15 trạng thái từng đơn hoặc gửi thao tác trực tiếp dưới vai trò `DCE`, `CSĐT` hoặc `CUSTOMER`.
