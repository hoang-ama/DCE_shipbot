# RAG PRICING ENGINE — QUY TẮC TÍNH CƯỚC, BẢNG GIÁ & MARGIN +30%

Tài liệu đặc tả công thức tính cước vận chuyển, quy đổi thể tích hàng hóa, chính sách biên lợi nhuận (`+30% Margin`) áp dụng cho cả **Bảng giá chuẩn** lẫn **Báo giá ngoại lệ từ DCE Ops (Cấp 1) / CSĐT (Cấp 2)** trong hệ thống **Đi Chung Express ShipBot**.

---

## 1. CÔNG THỨC QUY ĐỔI KHỐI LƯỢNG THỂ TÍCH (VOLUMETRIC WEIGHT)

Các kiện hàng cồng kềnh chiếm diện tích khoang xe hoặc khoang máy bay nhưng khối lượng thực tế nhẹ được tính theo **Trọng lượng tính cước (Chargeable Weight)**:

$$\text{Trọng lượng tính cước (kg)} = \max(\text{Trọng lượng thực tế (kg)}, \text{Trọng lượng quy đổi (kg)})$$

### A. Vận chuyển Hỏa Tốc Đường Hàng Không (Air Express)
Áp dụng cho các tuyến bay liên miền (Hà Nội $\leftrightarrow$ TP. Hồ Chí Minh, Hà Nội $\leftrightarrow$ Đà Nẵng, TP.HCM $\leftrightarrow$ Hải Phòng...):

$$\text{Trọng lượng quy đổi (kg)} = \frac{\text{Chiều dài (cm)} \times \text{Chiều rộng (cm)} \times \text{Chiều cao (cm)}}{6000}$$

### B. Vận chuyển Tiết Kiệm Đường Bộ / Xe Tải / Cargo (Road Freight)
Áp dụng cho các tuyến nội vùng và liên tỉnh đường bộ:

$$\text{Trọng lượng quy đổi (kg)} = \frac{\text{Chiều dài (cm)} \times \text{Chiều rộng (cm)} \times \text{Chiều cao (cm)}}{5000}$$

*Quy đổi theo thể tích mét khối ($m^3$)*: $1\text{ m}^3 \approx 250\text{ kg}$.

---

## 2. CÔNG THỨC BÁO GIÁ & CHÍNH SÁCH BIÊN LỢI NHUẬN (+30%)

### A. Công thức áp dụng chung cho Cước Chuẩn & Báo Giá Đối Tác (`DCE Ops` Cấp 1 / `CSĐT` Cấp 2)
Dù đơn được tính tự động từ bảng giá hay nhận báo giá gốc trực tiếp qua Zalo từ **DCE Ops (Cấp 1)** / **CSĐT (Cấp 2)**:

$$\text{Giá báo Khách hàng} = \text{Giá gốc đối tác} + 30\% = \text{round}(\text{Giá gốc} \times 1.30)$$

- Khi đối tác nhắn báo giá gốc qua Zalo (hỗ trợ viết tắt trong [`dispatchAgent.ts`](src/chatbot/agents/dispatchAgent.ts) và [`mediaAgent.ts`](src/chatbot/agents/mediaAgent.ts)):
  - `"1tr2"` $\rightarrow$ Giá gốc `1.200.000 VNĐ` $\rightarrow$ **Giá báo Khách (`+30%`): `1.560.000 VNĐ`**.
  - `"1tr"` $\rightarrow$ Giá gốc `1.000.000 VNĐ` $\rightarrow$ **Giá báo Khách (`+30%`): `1.300.000 VNĐ`**.
  - Tuyến Hà Nội $\rightarrow$ Ninh Bình giá gốc `250.000 VNĐ` $\rightarrow$ **Giá báo Khách: `325.000 VNĐ`**.
- Cả `base_cost_vnd` (giá gốc) và `customer_quote_vnd` (giá +30%) đều được lưu vào bảng `shipping_orders` và hiển thị rõ trong UI **Điều phối Live** ([`DispatchMonitorModal.tsx`](src/frontend/components/DispatchMonitorModal.tsx)) cũng như cổng nhập giá `/quote/:trackingCode` ([`quotes.ts`](src/modules/pricing/quotes.ts)).

### B. Chính sách Thương Lượng & Chiết Khấu Tự Động (Lần 1: -10%)
- **Lần 1 (Khách thương lượng / chê đắt)**: Trong [`evaluateNegotiationOffer`](src/chatbot/agents/closingAgent.ts) (và fallback tại `server.ts`), hệ thống kiểm tra mức sàn an toàn (`floorVnd = baseCostVnd * 1.1` hoặc tối đa `-10%` trên giá báo khách), áp dụng 1 lần duy nhất (`negotiation_used = TRUE`):
  $$\text{Giá ưu đãi} = \text{Giá báo lần 1} \times 0.90 \quad (\ge \text{Giá gốc} \times 1.10)$$
- **Lần 2 trở đi hoặc đề xuất thấp hơn sàn**: Chuyển tiếp câu hỏi/yêu cầu sang đối tác hoặc gắn cờ hỗ trợ trực tiếp từ chuyên viên điều phối.

---

## 3. BẢNG CƯỚC CHUẨN LIÊN TỈNH ĐI CHUNG EXPRESS (Cấu hình động trong `standard_price_routes`)

### A. Tuyến Hà Nội $\leftrightarrow$ Quảng Ninh (Hạ Long, Cẩm Phả, Uông Bí, Đông Mai...)
- **Thời gian cam kết**: 4 - 6 giờ (Giao nhận trong ngày).
- **Cước đường bộ tiết kiệm**:
  - Kiện nhỏ ($\le 5\text{kg}$, kích thước $\le 20\times 20\times 20\text{cm}$): Giá gốc 150.000 đ $\rightarrow$ **Giá báo: 195.000 đ**.
  - Kiện vừa ($\le 15\text{kg}$, kích thước $\le 40\times 40\times 40\text{cm}$): Giá gốc 200.000 đ $\rightarrow$ **Giá báo: 260.000 đ**.
  - Kiện to ($\le 30\text{kg}$, kích thước $\le 60\times 60\times 60\text{cm}$): Giá gốc 250.000 đ $\rightarrow$ **Giá báo: 325.000 đ**.
  - Vượt 30kg: Cộng thêm **8.000 đ/kg** phát sinh.

### B. Tuyến Hà Nội $\leftrightarrow$ Hải Phòng
- **Thời gian cam kết**: 2 - 4 giờ (Chạy cao tốc 5B).
- **Cước đường bộ**:
  - Kiện nhỏ ($\le 5\text{kg}$): Giá gốc 120.000 đ $\rightarrow$ **Giá báo: 156.000 đ**.
  - Kiện vừa ($\le 15\text{kg}$): Giá gốc 160.000 đ $\rightarrow$ **Giá báo: 208.000 đ**.
  - Kiện to ($\le 30\text{kg}$): Giá gốc 200.000 đ $\rightarrow$ **Giá báo: 260.000 đ**.
  - Vượt 30kg: Cộng thêm **7.000 đ/kg** phát sinh.

### C. Tuyến Hà Nội $\leftrightarrow$ Ninh Bình / Nam Định / Hà Nam
- **Thời gian cam kết**: 2 - 4 giờ.
- **Cước đường bộ**:
  - Kiện nhỏ ($\le 5\text{kg}$): Giá gốc 100.000 đ $\rightarrow$ **Giá báo: 130.000 đ**.
  - Kiện vừa ($\le 15\text{kg}$): Giá gốc 150.000 đ $\rightarrow$ **Giá báo: 195.000 đ**.
  - Kiện to ($\le 30\text{kg}$): Giá gốc 220.000 đ $\rightarrow$ **Giá báo: 285.000 đ**.
  - Vượt 30kg: Cộng thêm **6.000 đ/kg** phát sinh.

### D. Tuyến Trục Bắc - Nam: Hà Nội $\leftrightarrow$ TP. Hồ Chí Minh
- **Phương án 1: Hỏa tốc Hàng không (Air Express)**:
  - Thời gian: 6 - 12 giờ nhận tận nơi.
  - Tài liệu / Bưu kiện nhỏ ($\le 2\text{kg}$): Giá gốc 350.000 đ $\rightarrow$ **Giá báo: 455.000 đ**.
  - Kiện vừa ($\le 10\text{kg}$): Giá gốc 550.000 đ $\rightarrow$ **Giá báo: 715.000 đ**.
  - Hàng nặng ($> 10\text{kg}$): Giá gốc 45.000 đ/kg $\rightarrow$ **Giá báo: 58.500 đ/kg**.
- **Phương án 2: Đường bộ Tiết kiệm (Road Cargo)**:
  - Thời gian: 48 - 60 giờ (2 - 3 ngày).
  - Kiện $\le 5\text{kg}$: Giá gốc 150.000 đ $\rightarrow$ **Giá báo: 195.000 đ**.
  - Kiện $\le 20\text{kg}$: Giá gốc 280.000 đ $\rightarrow$ **Giá báo: 365.000 đ**.
  - Vượt 20kg: Tính **12.000 đ/kg**.

### E. Vận chuyển Nội thành (Hà Nội & TP. Hồ Chí Minh)
- **Giao hỏa tốc 1 - 2 giờ**: 60.000 đ $\rightarrow$ 90.000 đ tùy khoảng cách km.
- **Giao trong ngày (4 - 6 giờ)**: 35.000 đ $\rightarrow$ 55.000 đ.

---

## 4. QUY ĐỊNH PHỤ PHÍ VẬN CHUYỂN (SURCHARGES)

- **Phụ phí ngõ hẹp**: Hẻm/ngõ xe tải không vào được, phải trung chuyển xe máy hoặc đi bộ $> 200\text{m}$: `+30.000 VNĐ`.
- **Phụ phí bốc xếp hàng nặng**: Kiện hàng trên 30kg cần tài xế hỗ trợ bê vác lên tầng lầu: `+50.000 VNĐ/kiện`.
- **Phụ phí hẹn giờ chính xác**: Yêu cầu giao đúng khung giờ $\pm 15$ phút: `+30.000 VNĐ`.
- **Thu hộ COD**: Miễn phí với đơn dưới 1.000.000 VNĐ; trên 1.000.000 VNĐ thu 1% giá trị tiền COD.

---

## 5. VỊ TRÍ TRIỂN KHAI TRONG MÃ NGUỒN HIỆN HÀNH

Logic định giá và tính `+30% Margin` được tách gọn vào các module sau (tái sử dụng thống nhất cho Web, Zalo Webhook, Quick Quote Portal và Orchestrator):

1. [`src/modules/pricing/engine.ts`](src/modules/pricing/engine.ts) *(đồng bộ UI tại [`src/frontend/utils/pricingEngine.ts`](src/frontend/utils/pricingEngine.ts))*:
   - Chứa `calculateDCExpressPriceFromShippingInfo(shippingInfo, routes)`, `DEFAULT_STANDARD_ROUTES`, quy đổi thể tích $/5000$ & $/6000$, phụ phí và định dạng tiền tệ `formatVnd`.
2. [`src/modules/pricing/quotes.ts`](src/modules/pricing/quotes.ts) & [`src/modules/pricing/routes.ts`](src/modules/pricing/routes.ts):
   - Xử lý cổng nhập giá nhanh `GET /quote/:trackingCode`, `POST /api/orders/:trackingCode/quote`, parser tiền tệ `parseVietnameseMoney`, chuyển trạng thái sang `QUOTED_WAITING_CUSTOMER` và đồng bộ bảng `standard_price_routes`.
3. [`src/chatbot/agents/dispatchAgent.ts`](src/chatbot/agents/dispatchAgent.ts):
   - Chứa `parseBaseQuoteAmountVnd`, `applyMargin30Percent` (`Math.round(baseCostVnd * 1.3)`) và `analyzeStaffReply` để xử lý trực tiếp tin nhắn báo giá ngắn từ DCE Ops / CSĐT trên Zalo OA.
4. [`src/chatbot/agents/closingAgent.ts`](src/chatbot/agents/closingAgent.ts):
   - Chứa `evaluateNegotiationOffer` (đàm phán tối đa -10% giữ sàn `baseCost * 1.1`) và `buildPaymentLinkMessage` (gửi link VietQR song song khi khách thanh toán lúc gửi hàng).
