import {
  calculateDCExpressPriceFromShippingInfo,
  DEFAULT_STANDARD_ROUTES,
  StandardPriceRoute,
  formatVnd,
} from '../pricing/engine';
import { generateTrackingCode } from '../../chatbot/extraction/express';
import { pricingState } from '../pricing/state';
import { supplierState } from './state';
import { OrderRecordDB } from '../booking/state';

export function generateOpsShipmentNotification(
  info: any,
  trackingCode?: string,
  source?: string,
  customerName?: string,
  customerPhone?: string
): string {
  const code = trackingCode || info?.trackingCode || generateTrackingCode();
  const senderAddr = info?.sender?.address?.trim() || '(Chưa có)';
  const receiverAddr = info?.receiver?.address?.trim() || '(Chưa có)';
  const cargoName = info?.cargo?.items?.length ? info.cargo.items.map((i:any)=>`${i.name} (${i.weight})`).join('; ') : info?.cargo?.name?.trim() || 'Hàng hóa chung';
  const cargoWeight = info?.cargo?.weight?.trim() || (info?.cargo?.weightKg ? `${info.cargo.weightKg} kg` : '(Theo thực tế)');
  const cargoDim = info?.cargo?.dimensions?.raw?.trim() ||
    (info?.cargo?.dimensions?.length && info?.cargo?.dimensions?.width && info?.cargo?.dimensions?.height
      ? `${info.cargo.dimensions.length}x${info.cargo.dimensions.width}x${info.cargo.dimensions.height} cm`
      : 'Tiêu chuẩn');
  const specialNotes = info?.cargo?.specialNotes?.trim() ? `\n📝 Ghi chú: ${info.cargo.specialNotes.trim()}` : '';
  const deliveryTime = info?.deliveryTime?.trim() || 'Trong ngày / Thỏa thuận';

  const sName = customerName || info?.sender?.name || '';
  const sPhone = customerPhone || info?.sender?.phone || '';
  const senderContact = [sName, sPhone].filter(Boolean).join(' - ');
  const receiverContact = [info?.receiver?.name, info?.receiver?.phone].filter(Boolean).join(' - ');

  const publicBaseUrl = (process.env.APP_URL || 'http://localhost:2700').replace(/\/+$/, '');
  const quoteUrl = `${publicBaseUrl}/quote/${encodeURIComponent(code)}`;

  const pricing = calculateDCExpressPriceFromShippingInfo(info, pricingState.activeStandardRoutes);
  const priceLine = pricing.hasStandardPrice && pricing.recommendedServices[0]
    ? `\n💰 Giá cước chuẩn tham khảo: ${formatVnd(pricing.recommendedServices[0].customerQuoteVnd)} (${pricing.recommendedServices[0].serviceName})`
    : `\n⚠️ Trạng thái giá: Chưa có trong Bảng giá chuẩn -> Cần báo giá ngay`;

  return `🚛 [ĐI CHUNG EXPRESS - BÁO GIÁ ĐƠN MỚI CHO SUPPLIER]
📋 Mã vận đơn: ${code}
---------------------------------------------
📍 ĐIỂM LẤY HÀNG:
   ${senderAddr}${senderContact ? `\n   (Người gửi: ${senderContact})` : ''}

🎯 ĐIỂM GIAO HÀNG:
   ${receiverAddr}${receiverContact ? `\n   (Người nhận: ${receiverContact})` : ''}

📦 THÔNG TIN KIỆN HÀNG:
   - Tên loại hàng: ${cargoName}
   - Khối lượng: ${cargoWeight}
   - Kích thước: ${cargoDim}${specialNotes}

⏰ THỜI GIAN GIAO NHẬN:
   - ${deliveryTime}${priceLine}
---------------------------------------------
🔗 Nhập giá nhanh 1-Click: ${quoteUrl}
💬 Hoặc nhắn Zalo: #baogia ${code} [Giá_gốc]
⚡ Kính gửi Quý Đối Tác / Nhà Xe (${supplierState.defaultSupplierName}) báo giá vận chuyển tuyến này giúp Đi Chung Express.
📞 Hotline Điều phối DCE Ops: ${supplierState.dceOpsPhone}`;
}

export function generateDispatchOrderText(order: OrderRecordDB): string {
  const sAddr = order.shippingInfo?.sender?.address || '(Chưa có)';
  const rAddr = order.shippingInfo?.receiver?.address || '(Chưa có)';
  const sContact = [order.shippingInfo?.sender?.name || order.customerName, order.shippingInfo?.sender?.phone || order.customerPhone].filter(Boolean).join(' - ') || '(Đang cập nhật)';
  const rContact = [order.shippingInfo?.receiver?.name, order.shippingInfo?.receiver?.phone].filter(Boolean).join(' - ') || '(Đang cập nhật)';
  const cargoName = order.shippingInfo?.cargo?.items?.length ? order.shippingInfo.cargo.items.map((i:any)=>`${i.name} (${i.weight})`).join('; ') : order.shippingInfo?.cargo?.name || 'Hàng hóa';
  const weight = order.shippingInfo?.cargo?.weight || (order.shippingInfo?.cargo?.weightKg ? `${order.shippingInfo.cargo.weightKg}kg` : 'Theo thực tế');
  const deliveryTime = order.shippingInfo?.deliveryTime || 'Theo thỏa thuận';
  const priceStr = order.estimatedPrice ? formatVnd(order.estimatedPrice) : 'Theo thỏa thuận';
  const paymentStr =
    order.paymentStatus === 'paid'
      ? `✅ ĐÃ THANH TOÁN (Chuyển khoản VietQR${order.paymentRef ? ` - Mã GD: ${order.paymentRef}` : ''})`
      : '💵 THU HỘ COD / TIỀN MẶT KHI LẤY & GIAO HÀNG';

  return `🚀 [ĐI CHUNG EXPRESS - LỆNH ĐIỀU PHỐI LẤY HÀNG CHÍNH THỨC]
📋 Mã vận đơn: ${order.trackingCode}
---------------------------------------------
💰 GIÁ CƯỚC ĐÃ CHỐT: ${priceStr}
💳 THANH TOÁN: ${paymentStr}

⏰ THỜI GIAN LẤY HÀNG CAM KẾT:
   ${deliveryTime}

📍 ĐỊA ĐIỂM LẤY HÀNG:
   ${sAddr}
   👤 Contact người gửi/lấy: ${sContact}

🎯 ĐỊA ĐIỂM GIAO HÀNG:
   ${rAddr}
   👤 Contact người nhận: ${rContact}

📦 HÀNG HÓA: ${cargoName} (${weight})${order.shippingInfo?.cargo?.specialNotes ? `\n📝 Ghi chú: ${order.shippingInfo.cargo.specialNotes}` : ''}
---------------------------------------------
📞 Hotline Điều phối DCE Ops: ${supplierState.dceOpsPhone}
✨ Cảm ơn Quý khách & Đối tác đã đồng hành cùng Đi Chung Express!`;
}
