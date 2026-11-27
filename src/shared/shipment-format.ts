export function generateTrackingCode(): string {
  const date = new Date();
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `VN-LOG-${d}${m}-${rand}`;
}


export function generateShipmentTextSummary(info: any, trackingCode?: string): string {
  const code = trackingCode || info?.trackingCode || generateTrackingCode();
  const senderAddr = info?.sender?.address?.trim() || '(Chưa có)';
  const receiverAddr = info?.receiver?.address?.trim() || '(Chưa có)';
  const cargoName = Array.isArray(info?.cargo?.items)&&info.cargo.items.length?info.cargo.items.map((i:any)=>`${i.name} (${i.weight})`).join('; '):info?.cargo?.name?.trim() || '(Chưa có)';
  const cargoWeight = info?.cargo?.weight?.trim() || (info?.cargo?.weightKg ? `${info.cargo.weightKg}kg` : '(Chưa có)');
  const cargoDim = info?.cargo?.dimensions?.raw?.trim() ||
    (info?.cargo?.dimensions?.length && info?.cargo?.dimensions?.width && info?.cargo?.dimensions?.height
      ? `${info.cargo.dimensions.length}x${info.cargo.dimensions.width}x${info.cargo.dimensions.height} cm`
      : '0x0x0 cm');
  const specialNotes = info?.cargo?.specialNotes?.trim() ? `\n- Ghi chú chi tiết: ${info.cargo.specialNotes.trim()}` : '';
  const deliveryTime = info?.deliveryTime?.trim() || '(Chưa có)';

  return `📦 [THÔNG TIN ĐƠN VẬN CHUYỂN HÀNG HÓA - ${code}]
-----------------------------
👤 1. NGƯỜI GỬI:
- Địa chỉ lấy hàng: ${senderAddr}${info?.sender?.name ? `\n- Tên người gửi: ${info.sender.name}` : ''}${info?.sender?.phone ? `\n- SĐT: ${info.sender.phone}` : ''}

🎯 2. NGƯỜI NHẬN:
- Địa chỉ nhận hàng: ${receiverAddr}${info?.receiver?.name ? `\n- Tên người nhận: ${info.receiver.name}` : ''}${info?.receiver?.phone ? `\n- SĐT: ${info.receiver.phone}` : ''}

📦 3. THÔNG TIN HÀNG HÓA:
- Tên loại hàng: ${cargoName}
- Khối lượng: ${cargoWeight}
- Kích thước (DxRxC): ${cargoDim}${specialNotes}

⏰ 4. THỜI GIAN GIAO NHẬN:
- ${deliveryTime}
-----------------------------`;
}
