import { supplierEnabled } from "../../config/env";
import { OrderRecordDB, inMemoryOrders } from '../booking/state';
import { findOrderByTrackingCodeOrSuffix } from '../booking/service';
import { databaseState } from '../../database/connection';
import { generateDispatchOrderText } from '../supplier/format';
import { sendZaloOAReply } from '../zalo/sender';
import { recordCrmInteraction } from '../customer/service';
import { supplierState } from '../supplier/state';
import { logZaloEvent } from '../zalo/events';

export async function completeOrderPaymentAndDispatch(params: {
  codeOrSuffix: string;
  method: 'vietqr' | 'cod';
  paymentRef?: string;
}): Promise<{
  success: boolean;
  order?: OrderRecordDB;
  dispatchText?: string;
  error?: string;
}> {
  const order = await findOrderByTrackingCodeOrSuffix(params.codeOrSuffix);
  if (!order) {
    return { success: false, error: `Không tìm thấy đơn hàng ${params.codeOrSuffix}` };
  }

  const isPaid = params.method === 'vietqr';
  order.status = 'dispatched';
  order.paymentMethod = params.method;
  order.paymentStatus = isPaid ? 'paid' : 'cod_pending';
  order.paidAt = isPaid ? new Date().toISOString() : undefined;
  order.paymentRef = params.paymentRef || (isPaid ? `VQR-${Date.now().toString().slice(-6)}` : undefined);

  const idx = inMemoryOrders.findIndex((o) => o.id === order.id);
  if (idx >= 0) inMemoryOrders[idx] = order;

  if (databaseState.dbPool) {
    try {
      await databaseState.dbPool.query(
        `UPDATE shipping_orders
         SET status = 'dispatched',
             payment_method = $1,
             payment_status = $2,
             paid_at = $3,
             payment_ref = $4
         WHERE tracking_code = $5`,
        [order.paymentMethod, order.paymentStatus, order.paidAt || null, order.paymentRef || null, order.trackingCode]
      );
    } catch (e: any) {
      console.error('[Payment/Dispatch] DB update failed:', e?.message);
    }
  }

  const dispatchText = generateDispatchOrderText(order);

  // 1. Gửi cho Khách hàng (nếu có zaloUserId)
  const targetCustomerId =
    order.zaloUserId ||
    (order.id.startsWith('zalo-ord-') ? order.id.split('-')[2] : undefined);
  if (targetCustomerId) {
    sendZaloOAReply(targetCustomerId, dispatchText)
      .then((ok) => {
        if (ok) recordCrmInteraction(targetCustomerId, 'bot', dispatchText, order.shippingInfo, 'Lệnh Điều Phối Lấy Hàng');
      })
      .catch(() => {});
  }

  // 2. Gửi cho DCE Ops
  if (supplierEnabled && supplierState.dceOpsUserId) {
    sendZaloOAReply(supplierState.dceOpsUserId, dispatchText).catch(() => {});
  }

  // 3. Gửi cho Nhà cung cấp mặc định (Dichung Express)
  if (supplierEnabled && supplierState.defaultSupplierUserId && supplierState.defaultSupplierUserId !== supplierState.dceOpsUserId) {
    sendZaloOAReply(supplierState.defaultSupplierUserId, dispatchText).catch(() => {});
  }

  logZaloEvent('outgoing_reply', `Phát hành Lệnh Điều Phối đơn ${order.trackingCode} (${isPaid ? 'Đã TT VietQR' : 'COD'})`, {
    trackingCode: order.trackingCode,
    paymentStatus: order.paymentStatus,
    paymentRef: order.paymentRef,
  });

  return { success: true, order, dispatchText };
}
