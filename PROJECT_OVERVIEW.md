# DC EXPRESS SHIPBOT - TỔNG QUAN DỰ ÁN & KIẾN TRÚC HỆ THỐNG

## 1. TỔNG QUAN DỰ ÁN & BỐI CẢNH DOANH NGHIỆP

- **Doanh nghiệp**: Đi Chung Express (Công ty Cổ phần Vận tải Hàng hóa Đi Chung - `dichung.vn` / `dichungexpress.com`).
- **Mục tiêu**: Tự động hóa 100% luồng tiếp nhận nhu cầu vận chuyển, bóc tách và chuẩn hóa địa chỉ đến cấp Phường/Xã trên 63 tỉnh thành, tính giá cước RAG minh bạch (+30% Margin), lưu trữ thông tin vào cơ sở dữ liệu tập trung và đẩy dữ liệu đơn hàng tự động sang hệ thống điều hành **DC Hub Portal** (`portal.dichung.vn`).
- **Kênh tiếp nhận khách hàng**:
  1. **Web App ShipBot**: Giao diện hội thoại trực quan kết hợp Phiếu Vận Đơn (Waybill Card) thời gian thực và quản lý đơn hàng.
  2. **Zalo Official Account (OA)**: Kênh tương tác tự động 24/7 qua Webhook OpenAPI v4 của Zalo, tự động gia hạn token vĩnh viễn và lưu vết CRM.
  3. **Hotline & VoIP (Định hướng tích hợp)**: Tiếp nhận nhu cầu qua tổng đài viên và Callbot AI.

---

## 2. QUY TRÌNH TƯ VẤN KHÁCH HÀNG TỰ NHIÊN 5 GIAI ĐOẠN (PROGRESSIVE DISCLOSURE)

Khách hàng gửi hàng thường ngần ngại khi phải điền các biểu mẫu dài hoặc bị hỏi dồn dập thông tin cá nhân (Tên, SĐT) ngay từ đầu. Do đó, ShipBot áp dụng kịch bản tư vấn tự nhiên từng bước:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   GIAI ĐOẠN 1: THU THẬP THÔNG TIN TÍNH CƯỚC            │
│  1. Điểm lấy hàng (Lấy ở đâu? Dịch ngược ra Phường/Xã, Quận, Tỉnh)     │
│  2. Điểm giao hàng (Giao tới đâu? Dịch ngược ra Phường/Xã, Quận, Tỉnh) │
│  3. Thông tin hàng hóa (Tên loại hàng + Cân nặng kg / Kích thước DxRxC)│
│  4. Thời gian giao nhận (Giao hỏa tốc trong ngày, sáng mai, hẹn giờ...)│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Đủ 4 thông tin critical
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   GIAI ĐOẠN 2: BÁO GIÁ & XÁC NHẬN CHỐT GIÁ             │
│  • Động cơ RAG Pricing tính cước tự động (+30% Margin).                │
│  • Báo phương án: Đường bộ tiết kiệm hoặc Hỏa tốc đường bay.           │
│  • Chỉ khi khách xác nhận đồng ý giá mới chuyển sang giai đoạn sau.    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Khách đồng ý giá
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               GIAI ĐOẠN 3: THU THẬP THÔNG TIN VẬN HÀNH & THANH TOÁN    │
│  5. Thông tin liên lạc 2 đầu (Họ tên + Số điện thoại người gửi & nhận) │
│  6. Bên thanh toán cước (Đầu gửi thanh toán hay Đầu nhận thanh toán)   │
│  7. Hình thức thanh toán (Tiền mặt/COD khi lấy-giao hay Chuyển khoản)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Đủ điều kiện vận hành đơn hàng
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               GIAI ĐOẠN 4: TIỆN ÍCH GIA TĂNG (OPTIONAL)                │
│  • Hỏi nhanh nhu cầu xuất hóa đơn thuế VAT (Mã số thuế, email cty).   │
│  • Bảo hiểm hàng hóa bổ sung (Khai giá trị hàng hóa nếu có).           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│          GIAI ĐOẠN 5: ORDER CONFIRMATION & ĐIỀU PHỐI TÀI XẾ (DISPATCH) │
│  • Xuất Phiếu vận đơn Order Confirmation chính thức (Mã VN-LOG).       │
│  • Bắn Lead tạo đơn sang DC Hub Portal (portal.dichung.vn).            │
│  • Tự động gửi thông tin tài xế (Tên, SĐT, Biển số) cho khách hàng.   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. CƠ CHẾ DỊCH NGƯỢC ĐỊA CHÍNH (REVERSE GEOCODING) & PHÂN LOẠI HÀNG HÓA

Điểm cốt lõi giúp ShipBot của Đi Chung Express hoạt động chính xác là bộ luật bóc tách và chuẩn hóa địa chỉ Việt Nam đã được huấn luyện (fine-tuned) trong `server.ts` và `src/data/vnAdministrative.ts`:

1. **Dịch ngược từ địa danh, tòa nhà, bến bãi**:
   - Khi khách nói: `"Keangnam"` $\rightarrow$ Hệ thống tự động dịch ngược thành: `Tòa nhà Keangnam Landmark 72, Đường Phạm Hùng, Phường Mễ Trì, Quận Nam Từ Liêm, Hà Nội` (đáp ứng điều kiện có cấp Phường/Xã `hasWardCommune: true`).
   - Tương tự cho hàng trăm địa danh nổi tiếng: *Landmark 81, Royal City, Times City, Bitexco, Chợ Bến Thành, Sân bay Tân Sơn Nhất, Sân bay Nội Bài, KĐT PG An Đồng (Hải Phòng), Bãi Cháy (Quảng Ninh), Phổ Yên (Thái Nguyên)...*
2. **Dịch ngược từ Link Google Maps & Tọa độ GPS**:
   - Khách chia sẻ link `maps.app.goo.gl` hoặc tọa độ `lat, lng` $\rightarrow$ Tự động chuyển đổi thành địa chỉ hành chính có đầy đủ cấp Phường/Xã và không bao giờ để URL thô vào trường dữ liệu.
3. **Quy tắc hàng hóa 2/3 trường**:
   - Thông tin hàng hóa bắt buộc phải đạt ít nhất **2 trên 3 tiêu chí**: (1) Tên loại hàng, (2) Khối lượng (kg), (3) Kích thước (cm).
   - Tên hàng tự động quy đổi về loại danh mục chuẩn (*Hải sản, Hoa quả, Tài liệu, Thực phẩm, Đồ gia dụng, Linh kiện điện tử...*).

---

## 4. KIẾN TRÚC TOÀN DIỆN CỦA HỆ THỐNG (FULL-STACK ARCHITECTURE)

```text
                                [KHÁCH HÀNG]
                         ┌────────────┴────────────┐
                         ▼                         ▼
                 [Web App ShipBot]          [Zalo OA Chat]
                         │                         │
                         │ HTTP POST /api/chat     │ Webhook POST /api/zalo/webhook
                         ▼                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       EXPRESS SERVER (server.ts)                       │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    PIPELINE TRÍ TUỆ NHÂN TẠO                     │  │
│  │  1. Fast Rule Evaluator & Address Normalizer                     │  │
│  │  2. Vietnamese Administrative Mapping (vnAdministrative.ts)      │  │
│  │  3. Gemini 3.8 Flash (Thinking, Reverse Geocode, Slot Filling)   │  │
│  │  4. Anti-Repetition & Anti-Hallucination Regex Cleaners          │  │
│  │  5. RAG Pricing Engine (+30% Margin Calculation)                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │               ZALO OA OPENAPI V4 CONTROLLER                      │  │
│  │  • 1-Click OAuth with PKCE (code_verifier / code_challenge)      │  │
│  │  • Proactive Token Refresh Cron Job (Mỗi 30p, refresh ở 18h)     │  │
│  │  • Session Manager (Lưu session 6 tiếng chống mất ngữ cảnh)      │  │
│  │  • Send Message API (Phản hồi tự động + Tư vấn viên gửi tin)     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Connection Pool (SSL Enabled)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             POSTGRESQL DATABASE (Render Cloud: shipbot-db)             │
│                                                                        │
│  • zalo_auth:        Lưu access_token & refresh_token vĩnh viễn        │
│  • shipping_orders:  Lưu trữ phiếu vận đơn (Web App & Zalo OA)        │
│  • crm_customers:    Hồ sơ danh bạ khách hàng & số lần tạo đơn         │
│  • crm_messages:     Toàn bộ lịch sử tin nhắn 2 chiều giữa khách & bot │
│  • zalo_sessions:    Trạng thái phiên làm việc chống bay màu khi reset │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. THIẾT KẾ CƠ SỞ DỮ LIỆU POSTGRESQL (`shipbot-db`)

### 1. Bảng `zalo_auth`
Lưu trữ Access Token và Refresh Token của Zalo OA, bảo đảm server khi bị restart hoặc redeploy không bị mất quyền truy cập.
- `id`: Khóa chính (chuẩn `'default'`).
- `access_token`: Chuỗi token truy cập Zalo API (hiệu lực 25h).
- `refresh_token`: Chuỗi refresh token (hiệu lực 3 tháng).
- `updated_at`: Thời điểm cập nhật cuối cùng.

### 2. Bảng `shipping_orders`
Lưu trữ toàn bộ phiếu vận đơn được tạo từ cả Web App và tự động trích xuất từ cuộc trò chuyện trên Zalo OA.
- `id`: Khóa chính định danh (`order-timestamp` hoặc `zalo-ord-userId-timestamp`).
- `tracking_code`: Mã vận đơn duy nhất (`VN-LOG-DDMM-XXXX`).
- `created_at`: Thời gian tạo đơn.
- `status`: Trạng thái (`created`, `picked_up`, `delivering`, `delivered`).
- `customer_name`: Tên khách hàng / người gửi.
- `customer_phone`: Số điện thoại người gửi.
- `source`: Nguồn tạo (`web` hoặc `zalo`).
- `shipping_info`: Toàn bộ cấu trúc JSONB của đơn hàng (Địa chỉ 2 đầu, chi tiết hàng hóa, thời gian, cước phí).

### 3. Bảng `crm_customers`
Lưu trữ danh bạ khách hàng tương tác với Zalo OA để phục vụ chăm sóc và tiếp thị lại.
- `user_id`: ID người dùng trên Zalo OA.
- `name`: Tên khách hàng hiển thị hoặc tên bóc tách được từ đơn.
- `phone`: Số điện thoại.
- `address`: Địa chỉ của khách hàng.
- `order_count`: Tổng số đơn hàng đã đặt.
- `first_interaction` & `last_interaction`: Thời gian bắt đầu và lần nhắn tin gần nhất.
- `last_message`: Nội dung tin nhắn gần nhất.
- `shipping_info`: Bản chụp thông tin đơn hàng gần nhất.

### 4. Bảng `crm_messages`
Lưu trữ toàn bộ nội dung tin nhắn 2 chiều:
- `id`: Tự tăng (Serial).
- `user_id`: ID khách hàng Zalo.
- `sender`: `'user'`, `'bot'`, hoặc `'agent'` (tư vấn viên người thật).
- `sender_name`: Tên hiển thị người gửi.
- `message_text`: Nội dung tin nhắn.
- `shipping_info_snapshot`: Snapshot thông tin đơn tại thời điểm gửi.
- `created_at`: Thời gian gửi tin.

### 5. Bảng `zalo_sessions`
Lưu trữ trạng thái ngữ cảnh hội thoại (`history`, `currentInfo`, `lastActive`) để bot không bị "quên" thông tin giữa chừng khi server ngủ hoặc cập nhật code.

---

## 6. CẤU TRÚC JSON PAYLOAD MỤC TIÊU BẮN SANG DC HUB PORTAL

Khi đơn hàng đạt trạng thái chốt đơn, dữ liệu được tổng hợp theo schema chuẩn sẵn sàng gửi API POST sang `portal.dichung.vn`:

```json
{
  "order_code": "VN-LOG-1011-8921",
  "source": "zalo_oa",
  "workflow_stage": "confirmed",
  "is_price_agreed": true,
  "route_info": {
    "sender_area": "Hà Nội",
    "receiver_area": "Ninh Bình",
    "route_type": "lien_tinh_cung_mien"
  },
  "sender": {
    "name": "Chị Hoa",
    "phone": "0912345678",
    "address": "Khu vực Phường Vạn Phúc, Quận Hà Đông, Hà Nội",
    "ward": "Phường Vạn Phúc",
    "district": "Quận Hà Đông",
    "province": "Hà Nội"
  },
  "receiver": {
    "name": "Trường Mầm non Bắc Sơn",
    "phone": "0987654321",
    "address": "Trường Mầm non Bắc Sơn, Phường Bắc Sơn, Thành phố Tam Điệp, Ninh Bình",
    "ward": "Phường Bắc Sơn",
    "district": "Thành phố Tam Điệp",
    "province": "Ninh Bình"
  },
  "cargo": {
    "category": "Đồ gia dụng",
    "name": "Tượng chó đồng",
    "weight_kg": 30.0,
    "dimensions": {
      "length": 90,
      "width": 60,
      "height": null,
      "raw": "Cao 90x60"
    },
    "special_notes": "Tượng chó đồng Cao 90x60 nặng 30kg"
  },
  "schedule": {
    "pickup_time": "Trong ngày",
    "delivery_time": "Trong ngày"
  },
  "pricing": {
    "service_type": "Đường bộ tiết kiệm",
    "base_cost_vnd": 250000,
    "customer_quote_vnd": 325000,
    "margin_percent": 30.0,
    "is_accepted_by_customer": true
  },
  "payment": {
    "payer": "sender",
    "payment_method": "cash_on_pickup"
  }
}
```

---

## 7. CƠ CHẾ PHỐI HỢP NGƯỜI THẬT (HUMAN-IN-THE-LOOP)

Trong quá trình vận hành, ShipBot hỗ trợ cơ chế phối hợp thông minh với nhân viên điều phối:
1. **Can thiệp trực tiếp từ CRM Drawer**: Nhân viên có thể mở bảng điều khiển CRM trên Web App, theo dõi thời gian thực tin nhắn của khách và bấm gửi tin nhắn trực tiếp qua Zalo OA.
2. **Tự động chuyển tiếp khi khách không đồng ý giá 2 lần**: Nếu khách hàng từ chối mức giá ưu đãi lần 2, hệ thống tự động gắn nhãn "Cần tư vấn viên hỗ trợ" và gửi thông báo cho nhân viên trực chat.
3. **Phát hiện khiếu nại / trường hợp khẩn cấp**: Khách phản hồi về sự cố trễ chuyến, mất hàng hoặc yêu cầu gặp người thật sẽ được chuyển sang chế độ Handover.
