# RAG PRICING ENGINE - QUY TẮC TÍNH CƯỚC & BẢNG GIÁ DC EXPRESS

Tài liệu đặc tả toàn bộ công thức tính cước vận chuyển, quy đổi thể tích hàng hóa, chính sách biên lợi nhuận (+30% Margin) và cơ sở dữ liệu bảng giá cho hệ thống **Đi Chung Express ShipBot**.

---

## 1. CÔNG THỨC QUY ĐỔI KHỐI LƯỢNG THỂ TÍCH (VOLUMETRIC WEIGHT)

Trong ngành vận tải hàng hóa (Logistics), các kiện hàng cồng kềnh chiếm nhiều diện tích khoang xe hoặc khoang máy bay nhưng có khối lượng nhẹ sẽ được tính cước theo **Trọng lượng tính cước (Chargeable Weight)**:

$$\text{Trọng lượng tính cước (kg)} = \max(\text{Trọng lượng thực tế (kg)}, \text{Trọng lượng quy đổi (kg)})$$

### A. Vận chuyển Hỏa Tốc Đường Hàng Không (Air Express)
Áp dụng cho các tuyến bay liên miền (Hà Nội $\leftrightarrow$ TP. Hồ Chí Minh, Hà Nội $\leftrightarrow$ Đà Nẵng, TP.HCM $\leftrightarrow$ Hải Phòng...):

$$\text{Trọng lượng quy đổi (kg)} = \frac{\text{Chiều dài (cm)} \times \text{Chiều rộng (cm)} \times \text{Chiều cao (cm)}}{6000}$$

### B. Vận chuyển Tiết Kiệm Đường Bộ / Xe Tải / Cargo (Road Freight)
Áp dụng cho các tuyến nội vùng và liên tỉnh đường bộ:

$$\text{Trọng lượng quy đổi (kg)} = \frac{\text{Chiều dài (cm)} \times \text{Chiều rộng (cm)} \times \text{Chiều cao (cm)}}{5000}$$

*Quy đổi theo thể tích mét khối ($m^3$)*: $1 m^3 \approx 250 \text{ kg}$.

---

## 2. CÔNG THỨC BÁO GIÁ & CHÍNH SÁCH BIÊN LỢI NHUẬN (+30%)

### A. Công thức tính giá chuẩn cho Khách hàng
$$\text{Giá báo Khách hàng} = \text{Giá gốc (Chi phí đối tác/xe)} + 30\% \text{ (Biên lợi nhuận Đi Chung)}$$

$$\text{Giá báo Khách hàng} = \text{Giá gốc} \times 1.30$$

*Ví dụ thực tế*:
- Tuyến Hà Nội đi Quảng Ninh (kiện 10kg đường bộ): Giá gốc = 91.000 VNĐ.
  $$\text{Giá báo Khách} = 91.000 \times 1.3 = 118.300 \text{ VNĐ} \approx 118.000 \text{ VNĐ}$$
- Tuyến Hà Nội đi Ninh Bình (kiện tượng đồng 30kg đường bộ): Giá gốc = 250.000 VNĐ.
  $$\text{Giá báo Khách} = 250.000 \times 1.3 = 325.000 \text{ VNĐ}$$

### B. Chính sách Thương Lượng & Chiết Khấu Tự Động
- **Lần 1 (Khách chê đắt hoặc lưỡng lự)**: Bot tự động áp dụng mã ưu đãi/chiết khấu 10% trên giá báo:
  $$\text{Giá đàm phán lần 2} = \text{Giá báo lần 1} \times 0.90$$
  *Ví dụ*: $325.000 \times 0.90 = 292.500 \text{ VNĐ} \approx 290.000 \text{ VNĐ}$.
- **Lần 2 (Khách vẫn từ chối hoặc cần đàm phán thêm)**: Bot kích hoạt cờ `human_handover = true`, giữ nguyên thông tin đơn hàng và thông báo:
  *"Dạ đơn hàng của mình có tính chất đặc thù, em đã chuyển thông tin tới chuyên viên điều phối để hỗ trợ mức giá tốt nhất cho mình ngay đây ạ!"*

---

## 3. BẢNG CƯỚC CHUẨN LIÊN TỈNH ĐI CHUNG EXPRESS (2024 - 2026)

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

## 5. THIẾT KẾ MODULE TYPESCRIPT (`src/utils/pricingEngine.ts`)

Mẫu cấu trúc module TypeScript sẵn sàng triển khai vào hệ thống DCE_shipbot:

```typescript
export interface PricingRouteInput {
  senderProvince: string;
  receiverProvince: string;
  weightKg: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  isAirRequired?: boolean;
  hasNarrowAlley?: boolean;
  requiresHeavyHandling?: boolean;
}

export interface ServiceQuote {
  serviceCode: 'road_economy' | 'air_express' | 'inner_city';
  serviceName: string;
  estimatedTransitTime: string;
  baseCostVnd: number;
  customerQuoteVnd: number;
  marginPercent: number;
  chargeableWeightKg: number;
}

export interface PricingCalculationResult {
  routeType: 'inner_city' | 'interprovincial_near' | 'north_south' | 'interprovincial_far';
  volumetricWeightRoad: number;
  volumetricWeightAir: number;
  chargeableWeightKg: number;
  recommendedServices: ServiceQuote[];
}

/**
 * Tính toán trọng lượng quy đổi và báo giá cước chuẩn Đi Chung Express (+30% Margin)
 */
export function calculateDCExpressPrice(input: PricingRouteInput): PricingCalculationResult {
  const l = input.lengthCm || 0;
  const w = input.widthCm || 0;
  const h = input.heightCm || 0;

  const volRoad = (l > 0 && w > 0 && h > 0) ? Math.round((l * w * h) / 5000 * 10) / 10 : 0;
  const volAir = (l > 0 && w > 0 && h > 0) ? Math.round((l * w * h) / 6000 * 10) / 10 : 0;

  const chargeableWeightRoad = Math.max(input.weightKg, volRoad);
  const chargeableWeightAir = Math.max(input.weightKg, volAir);

  // Logic nhận diện tuyến đường và tính giá (Đường bộ + Đường bay) ...
  // Chi tiết cài đặt đầy đủ theo bảng giá ở Mục 3
}
```
