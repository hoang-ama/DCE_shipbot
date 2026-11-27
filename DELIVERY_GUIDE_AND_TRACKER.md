# TÀI LIỆU HƯỚNG DẪN VẬN HÀNH, KIẾN TRÚC & TRACKER TIẾN ĐỘ — DCE SHIPBOT

> **Phiên bản**: Unified Multi-Agent Merge (`main` commit `f7323c2`)  
> **Đối tượng sử dụng**: **Biz Owner / Bộ phận Vận hành (DCE Ops, CSĐT, CSKH)** và **Team Kỹ thuật (Dev / DevOps)**  
> **Mục tiêu**: Tổng hợp toàn bộ tính năng đã hoàn thiện sau đợt hợp nhất codebase + bảng theo dõi công việc (Tracker) cho các chặng triển khai tiếp theo.

---

## PHẦN 1 — TỔNG QUAN CHO BIZ OWNER & BỘ PHẬN VẬN HÀNH

### 1.1. Những vấn đề cốt lõi đã xử lý xong
1. **Zalo OA đi thẳng vào Chuyển phát hàng (`express`)**:
   - Khách nhắn qua Zalo OA sẽ vào thẳng luồng tiếp nhận thông tin gửi hàng (Địa chỉ lấy, Địa chỉ giao, Hàng hóa, Thời gian), **không hiển thị menu chọn đa dịch vụ** gây rối.
   - Menu đa dịch vụ (`Chuyển người / Chuyển hàng / Du lịch`) chỉ bật trên **Web Chat** (`/api/chat`).
2. **Phiên chat cố định 24 giờ & AI dừng hẳn khi Ops vào chat (Human Handover)**:
   - Mỗi khách hàng được cấp một **Mã phiên cố định 24h** (dạng `CHAT-DDMM-XXXX`, tính từ tin nhắn đầu tiên trong phiên).
   - Chỉ cần nhân viên Ops nhắn trên app **Zalo OA** hoặc trên màn hình **CRM Web**, AI tự động **dừng can thiệp suốt 24h của phiên đó** (đã đồng bộ cả ID Zalo app và ID OA để không bị sót).
   - Nếu cần bật lại AI sớm trong phiên, nhân viên nhắn `#bot` hoặc `#ai`. Sau 24h, khi khách nhắn lại sẽ tự động mở phiên mới và AI tiếp quản lại bình thường.
3. **Chống AI ghi đè nhầm dữ liệu khách chat**:
   - Các câu cảm thán, hỏi giá, giục nhanh (*"Nhanh giúp E vs"*, *"Ng nhận trả phí ship được k ạ"*) không còn bị ghi đè nhầm vào Địa chỉ giao hàng hoặc Thời gian.
4. **Điều phối Báo giá 2 cấp (`DCE Ops` Cấp 1 $\rightarrow$ `CSĐT` Cấp 2) & Tự động cộng biên lợi nhuận `+30%`**:
   - Với các tuyến ngoài bảng giá chuẩn, đơn hàng tạo xong (`#mã_đơn`) sẽ được chuyển **Cấp 1: DCE Ops (`0934691766`)** trước (chưa làm phiền Cấp 2).
   - Khi DCE Ops nhắn giá gốc (hỗ trợ viết tắt tiếng Việt, VD: `"1tr2"`, `"500k"`), AI tự động **nhân +30% margin** (`1.200.000` $\rightarrow$ **`1.560.000 VNĐ`**) và soạn lời văn CSKH lịch sự gửi lại khách hàng.
   - Nếu DCE Ops nhắn từ chối (*"Không"*, *"Ko nhận"*, *"Hết xe"*...), hệ thống tự động đẩy đơn sang **Cấp 2: CSĐT (`Dichung Express - 0906106066`)** theo cơ chế Waterfall. CSĐT báo giá gốc cũng được tự động **+30% margin** tương tự.
   - Nếu có từ **2 đơn đang chờ** cùng lúc mà đối tác nhắn giá không kèm mã, Bot sẽ hỏi lại nhanh đối tác (hỗ trợ **Zalo Quote-Reply** trực tiếp tin nhắn đơn hoặc ghi kèm `#4_số_cuối`, VD: `#8191 1tr2`). Nếu chỉ có 1 đơn chờ $\rightarrow$ **khớp tự động**.
5. **Quy trình Chốt đơn, Hỏi SĐT & Gửi VietQR song song**:
   - Khi khách đồng ý báo giá (`"Chốt"`, `"Ok"`, `"Đi đơn"`...), AI CSKH tự động thu thập tuần tự 4 thông tin bắt buộc:
     1) **SĐT người nhận hàng** $\rightarrow$ 2) **SĐT người gửi hàng** $\rightarrow$ 3) **Bên thanh toán (Người gửi / Người nhận)** $\rightarrow$ 4) **Thời điểm thanh toán (Lúc gửi hàng / Sau khi nhận hàng)**.
   - Nếu khách chọn **"Thanh toán lúc gửi hàng"**, hệ thống **vừa** gửi link thanh toán **VietQR động** (`/pay/:trackingCode`, vẫn cho phép COD) cho khách, **vừa song song** chuyển đủ thông tin cho đối tác đang phụ trách (`DCE` hoặc `CSĐT`) để lấy **SĐT Tài xế**.
   - Khi đối tác nhắn SĐT tài xế $\rightarrow$ Bot tự động gửi SĐT tài xế cho khách và đóng trạng thái **`COMPLETED`**.

### 1.2. Hướng dẫn thao tác nhanh cho Đội vận hành
| Vai trò | Kênh thao tác | Thao tác / Lệnh cần nhớ |
| :--- | :--- | :--- |
| **DCE Ops (Cấp 1)** | Zalo OA (từ SĐT `0934691766`) | Nhắn `#ops` 1 lần đầu để liên kết tài khoản.<br/>Khi nhận đơn `#XXXX`: **Quote-Reply** (hoặc nhắn `#XXXX 1tr2`) để báo giá gốc (`+30%` tự động); nhắn `"Không"` để chuyển CSĐT; nhắn SĐT tài xế khi khách đã chốt. |
| **CSĐT (Cấp 2)** | Zalo OA (`Dichung Express - 0906106066`) | Nhắn `#supplier` 1 lần đầu để liên kết.<br/>Nhận đơn tự động khi DCE Ops từ chối. Báo giá gốc, hỏi lại khách hoặc gửi SĐT tài xế tương tự Cấp 1. |
| **CSKH / Admin** | Web Quản trị (`https://ai.dichung.vn`) | • **CRM Khách Zalo**: xem lịch sử chat lọc theo **Phiên 24h** (`CHAT-...`), chat trực tiếp hoặc bấm **Dừng AI / Bật lại AI**.<br/>• **Điều phối Live**: theo dõi trực tiếp 15 trạng thái từng đơn (giá gốc, giá +30%, đối tác, SĐT nhận/gửi/tài xế) và có thể nhập phản hồi thủ công cho từng đơn.<br/>• **Simulator 3 Kênh** (`/playground.html`): giả lập song song Khách hàng $\leftrightarrow$ DCE $\leftrightarrow$ CSĐT kèm sơ đồ State Machine (Mermaid) và nút **Dịch / Ghi âm giọng nói**. |

---

## PHẦN 2 — TÀI LIỆU KỸ THUẬT CHO TEAM DEV

### 2.1. Kiến trúc Module Hóa (Tách Server & AI Multi-Agent)
```text
server.ts                           # Express HTTP entrypoint, /api/chat, /api/zalo/webhook, /api/dispatch, Vite/static prod fallback
├── src/config/                     # Env & runtime config (HOST=0.0.0.0, ADMIN_PASSCODE, Zalo/DB/Chatbot settings)
├── src/shared/                     # access-guard (ADMIN_PASSCODE), system-routes (/api/health, /api/auth/*), service menu, types
├── src/database/                   # PostgreSQL pool, bootstrap restore (<24h sessions), migrations/001_express.sql
├── src/chatbot/
│   ├── engine.ts & services/       # Router đa dịch vụ (Web: GROUP_MENU; Zalo OA: mặc định express)
│   ├── extraction/ & validation/   # Bóc tách địa chính VN, chống ghi đè / chống chatter
│   ├── agents/                     # Multi-Agent Layer dùng chung cho Live & Simulator:
│   │   ├── dispatchAgent.ts        # Phân tích phản hồi DCE/CSĐT (QUOTE/NEED_MORE_INFO/REJECT), +30% margin, form điều phối
│   │   ├── intakeAgent.ts          # Thu thập 4 trường form, dịch làm rõ, bóc tách SĐT, bên trả tiền, thời điểm thanh toán
│   │   ├── closingAgent.ts         # Phân tích chốt đơn (ACCEPT/DECLINE/ASK_INFO), đàm phán -10%, link VietQR song song
│   │   └── mediaAgent.ts           # Chuẩn hóa tiếng lóng vận tải (1tr2/500k), dịch thuật & chuyển giọng nói thành văn bản
│   └── playground/                 # API /api/chatbot/* cho Simulator 3 kênh
├── src/orchestrator/               # Master Coordinator điều phối 15 trạng thái end-to-end:
│   ├── stateMachine.ts             # Enum 15 trạng thái, allowed transitions, order_dispatch_threads (Quote-Reply & đa đơn)
│   ├── coordinator.ts              # handlePartnerZaloMessage() & handleCustomerZaloWorkflow()
│   └── routes.ts                   # GET /api/dispatch/orders & POST /api/dispatch/orders/:trackingCode/action
├── src/modules/                    # Nghiệp vụ Server tách module: zalo, customer, conversation, handover, booking, pricing, supplier, payment, asterisk
└── src/frontend/                   # React 19 UI (index.html, playground.html, dichung.html, DispatchMonitorModal, AdminAuthModal, CrmModal 24h)
```

### 2.2. Vòng đời 15 trạng thái đơn hàng (`OrderWorkflowState`)
`COLLECTING_INFO` $\rightarrow$ `WAITING_DCE` $\leftrightarrow$ `CLARIFYING_FOR_DCE` $\rightarrow$ *(nếu DCE từ chối)* `WAITING_CSDT` $\leftrightarrow$ `CLARIFYING_FOR_CSDT` $\rightarrow$ *(nếu có giá gốc +30%)* `QUOTED_WAITING_CUSTOMER` $\rightarrow$ `COLLECTING_RECIPIENT_PHONE` $\rightarrow$ `COLLECTING_SENDER_PHONE` $\rightarrow$ `COLLECTING_PAYMENT_PARTY` $\rightarrow$ `COLLECTING_PAYMENT_TIME` (+ link VietQR song song nếu trả lúc gửi) $\rightarrow$ `WAITING_DRIVER_PHONE_DCE` / `WAITING_DRIVER_PHONE_CSDT` $\rightarrow$ `COMPLETED` (nhánh kết thúc khác: `CUSTOMER_DECLINED`, `REJECTED`).

### 2.3. Bảo mật API (`ADMIN_PASSCODE`) & Database Migration
- **Khi `ADMIN_PASSCODE` để trống** (mặc định ban đầu): tất cả route mở để không làm gián đoạn vận hành hiện tại.
- **Khi cấu hình `ADMIN_PASSCODE=<pass>` trên VPS**:
  - Client tự gửi header `x-admin-passcode` qua [`auth.ts`](./src/frontend/utils/auth.ts) + popup [`AdminAuthModal.tsx`](./src/frontend/components/AdminAuthModal.tsx).
  - Các route **được bảo vệ**: `/api/crm/*`, `/api/dispatch/*`, `/api/orders` (trừ link công khai `GET/POST /api/orders/:code/quote` và `/api/orders/:code/payment`), `/api/config/*`, `/api/ops/*`, `/api/pricing/routes*`, `/api/db/*`, `/api/zalo/oauth/*`, `/api/zalo/status`, `/api/asterisk/calls`.
  - Các route **công khai**: `/api/health`, `/api/auth/status`, `/api/auth/verify`, `/api/chat`, `/api/zalo/webhook`, `/api/payment/webhook`, `/api/asterisk/incoming-call`, `/quote/:trackingCode`, `/pay/:trackingCode`, `/api/chatbot/*`.
- **Database PostgreSQL** (`001_express.sql`): tự chạy migration khi khởi động (`initDatabaseAndRestore`), thêm các cột `workflow_state`, `assigned_partner`, `chat_session_id`, `payment_party`, `payment_timing`, `driver_phone` trên `shipping_orders`; `current_session_id`, `session_started_at`, `human_takeover` trên `crm_customers`; và bảng `order_dispatch_threads` phục vụ Quote-Reply.

### 2.4. Kiểm thử & Deploy chuẩn
```bash
npm test      # 49/49 unit & orchestrator tests (offline, không cần GEMINI_API_KEY/DATABASE_URL)
npm run lint  # tsc --noEmit (strict TypeScript check)
npm run build # vite build (index.html, playground.html, dichung.html -> dist/)
```
Deploy tự động lên VPS qua GitHub Actions ([`deploy.yml`](./.github/workflows/deploy.yml)) mỗi khi push vào `main`.

---

## PHẦN 3 — MASTER TRACKER TIẾN ĐỘ (DÙNG ĐỂ CẬP NHẬT CHUNG BIZ & DEV)

> **Link Google Sheets Live (3 tab: Progress Tracker / Hướng dẫn Biz & Ops / Kiến trúc & API)**: https://docs.google.com/spreadsheets/d/1wGjlEyaLz-jm26RiDJrv-QBu4WK5Nks49I3dhVay9iM/edit  
> Bản CSV backup trong repo: [`DELIVERY_TRACKER_GSHEET.csv`](./DELIVERY_TRACKER_GSHEET.csv)

| ID | Hạng mục | Đầu việc (Task) | Phụ trách | Trạng thái | Ưu tiên | Ghi chú / Tiêu chí nghiệm thu |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **T-01** | Architecture | Tách module Server (`src/modules`), AI (`src/chatbot`), DB (`src/database`) | Dev Team | ✅ Done | P0 | Đã hợp nhất & push `main` (`f7323c2`), `tsc --noEmit` 0 lỗi |
| **T-02** | Zalo UX | Zalo OA mặc định vào thẳng `express`; giữ `GROUP_MENU` trên Web | Dev Team | ✅ Done | P0 | Đã pass test `Zalo OA defaults straight to express` |
| **T-03** | Handover & CRM | Phiên chat cố định 24h (`CHAT-DDMM-XXXX`), đồng bộ ID alias Zalo & lọc CRM | Dev & Ops | ✅ Done | P0 | AI dừng 24h khi Ops chat; tự tạo phiên mới sau 24h |
| **T-04** | Anti-Overwrite | Chặn AI ghi đè nhầm địa chỉ/thời gian bởi câu hỏi & tin giục nhanh | Dev Team | ✅ Done | P0 | Đã bổ sung rule chống chatter + 49/49 unit test pass |
| **T-05** | Dispatch +30% | Báo giá gốc DCE (Cấp 1) & CSĐT (Cấp 2) tự động cộng +30% margin | Dev & Ops | ✅ Done | P0 | `1tr2` $\rightarrow$ `1.560.000 VNĐ`, test pass |
| **T-06** | Waterfall 2 cấp | Điều phối DCE trước; DCE từ chối mới chuyển CSĐT (`Dichung Express`) | Dev & Ops | ✅ Done | P0 | `WAITING_DCE` $\rightarrow$ `WAITING_CSDT` $\rightarrow$ `REJECTED` |
| **T-07** | Multi-Order | Khớp đa đơn Zalo qua Quote-Reply (`zaloMsgId`), `#4_số` & tự hỏi khi $\ge 2$ đơn | Dev Team | ✅ Done | P0 | Lưu bảng `order_dispatch_threads` |
| **T-08** | Post-Quote Flow | Thu thập SĐT nhận $\rightarrow$ gửi $\rightarrow$ bên trả $\rightarrow$ thời điểm + link VietQR song song $\rightarrow$ SĐT tài xế | Dev Team | ✅ Done | P0 | Hoàn tất 15 trạng thái tới `COMPLETED` |
| **T-09** | Security & UI | Admin Passcode guard + Modal **Điều phối Live** 3 kênh + Simulator `/playground.html` | Dev Team | ✅ Done | P1 | Hiện đang để trống `ADMIN_PASSCODE` theo yêu cầu |
| **T-10** | VPS Deploy | Kiểm tra GitHub Actions & container VPS sau push `f7323c2` | Dev / Ops | 🔄 In Progress | P0 | Kiểm tra `/api/health` và DB migration trên `https://ai.dichung.vn` |
| **T-11** | Live Zalo Binding | Nhắn `#ops` từ Zalo `0934691766` & `#supplier` từ Zalo `0906106066` trên production | Biz Owner / Ops | ⏳ To Do | P0 | Bắt buộc thực hiện để bot gửi đơn cho đúng 2 tài khoản thật |
| **T-12** | UAT Thực tế | Chạy thử 5–10 đơn thật qua đủ luồng (Báo giá DCE, DCE từ chối $\rightarrow$ CSĐT, Chốt & Tài xế) | Biz Owner & Dev | ⏳ To Do | P0 | Xác nhận đúng câu chữ CSKH, giá +30% và handoff mượt |
| **T-13** | Payment Config | Cấu hình `PAYMENT_BANK_ID`, `ACCOUNT_NO`, Webhook SePay/Casso trên VPS | Biz Owner / Dev | ⏳ To Do | P1 | Tự động xác nhận `PAID` khi khách quét link VietQR |
| **T-14** | Admin Security | Đặt `ADMIN_PASSCODE` chính thức vào `.env` trên VPS & chia sẻ nội bộ team | Biz Owner / Dev | ⏳ To Do | P1 | Khóa truy cập `/api/crm/*`, `/api/orders`, `/api/dispatch/*` |
| **T-15** | Asterisk Call | Nối tổng đài Asterisk + template ZNS (`zalo_zns_template_id`) & test cuộc gọi nhỡ | Dev Team | ⏳ To Do | P2 | Gắn cuộc gọi với phiên 24h & tôn trọng handover |
| **T-16** | Multi-Supplier | Mở rộng danh sách nhiều nhà xe Cấp 2+ theo tuyến/tỉnh thay vì chỉ CSĐT mặc định | Dev & Biz | 📋 Backlog | P2 | Pha tiếp theo sau khi UAT luồng 2 cấp chạy ổn định |
| **T-17** | KPI Reporting | Báo cáo tỷ lệ chốt đơn, thời gian phản hồi DCE/CSĐT, doanh thu & biên lợi nhuận | Dev & Biz | 📋 Backlog | P3 | Export dashboard hoặc sync định kỳ ra Google Sheets |
