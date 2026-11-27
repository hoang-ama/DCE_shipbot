import {
  calculateDCExpressPriceFromShippingInfo,
  DEFAULT_STANDARD_ROUTES,
  StandardPriceRoute,
  formatVnd,
} from './engine';
import { OrderRecordDB, inMemoryOrders } from '../booking/state';
import { findOrderByTrackingCodeOrSuffix } from '../booking/service';
import { supplierState } from '../supplier/state';
import { databaseState } from '../../database/connection';
import { sendZaloOAReply } from '../zalo/sender';
import { recordCrmInteraction } from '../customer/service';
import { zaloUserSessions } from '../conversation/state';
import { saveSessionsCache } from '../conversation/service';
import { logZaloEvent } from '../zalo/events';

export function parseVietnameseMoney(raw: string): number {
  const s = String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return 0;
  const trMatch = s.match(/^(\d+(?:[.,]\d+)?)tr(?:iệu)?$/i);
  if (trMatch) {
    return Math.round(parseFloat(trMatch[1].replace(',', '.')) * 1000000);
  }
  const kMatch = s.match(/^(\d+(?:[.,]\d+)?)k$/i);
  if (kMatch) {
    return Math.round(parseFloat(kMatch[1].replace(',', '.')) * 1000);
  }
  const digits = s.replace(/[^\d]/g, '');
  if (!digits) return 0;
  const num = parseInt(digits, 10);
  // Nếu nhập số nhỏ như "450" hiểu là 450.000đ
  return num > 0 && num < 5000 ? num * 1000 : num;
}

export async function applyOrderQuote(params: {
  codeOrSuffix: string;
  inputAmountVnd: number;
  applyMargin?: boolean;
  quotedBy?: string;
  quoteNote?: string;
}): Promise<{
  success: boolean;
  order?: OrderRecordDB;
  baseCostVnd?: number;
  customerQuoteVnd?: number;
  customerNotified?: boolean;
  error?: string;
}> {
  const order = await findOrderByTrackingCodeOrSuffix(params.codeOrSuffix);
  if (!order) {
    return { success: false, error: `Không tìm thấy đơn hàng với mã "${params.codeOrSuffix}"` };
  }
  if (!params.inputAmountVnd || params.inputAmountVnd <= 0) {
    return { success: false, error: 'Số tiền báo giá không hợp lệ' };
  }

  const applyMargin = params.applyMargin !== false;
  const baseCostVnd = Math.round(params.inputAmountVnd);
  const customerQuoteVnd = applyMargin ? Math.round((baseCostVnd * 1.3) / 1000) * 1000 : baseCostVnd;
  const quotedBy = params.quotedBy || `DCE Ops (${supplierState.dceOpsPhone})`;
  const quotedAt = new Date().toISOString();

  order.status = 'quoted';
  order.workflowState = 'QUOTED_WAITING_CUSTOMER';
  order.assignedPartner = params.quotedBy?.toUpperCase().includes('CSĐT') || params.quotedBy?.toUpperCase().includes('CSDT') ? 'CSDT' : 'DCE';
  order.baseCostVnd = baseCostVnd;
  order.estimatedPrice = customerQuoteVnd;
  order.quotedBy = quotedBy;
  order.quotedAt = quotedAt;
  order.quoteNote = params.quoteNote;

  const memIdx = inMemoryOrders.findIndex((o) => o.id === order.id);
  if (memIdx >= 0) {
    inMemoryOrders[memIdx] = order;
  } else {
    inMemoryOrders.unshift(order);
  }

  if (databaseState.dbPool) {
    try {
      await databaseState.dbPool.query(
        `UPDATE shipping_orders
         SET status = 'quoted',
             base_cost_vnd = $1,
             customer_quote_vnd = $2,
             quoted_by = $3,
             quoted_at = NOW(),
             quote_note = $4
         WHERE tracking_code = $5`,
        [baseCostVnd, customerQuoteVnd, quotedBy, params.quoteNote || null, order.trackingCode]
      );
    } catch (e: any) {
      console.error('[Quick Quote] Failed to update DB:', e?.message);
    }
  }

  // Tự động gửi báo giá lại cho Khách hàng qua Zalo OA nếu đơn có zaloUserId
  let customerNotified = false;
  const targetCustomerId =
    order.zaloUserId ||
    (order.id.startsWith('zalo-ord-') ? order.id.split('-')[2] : undefined);

  if (targetCustomerId) {
    const sAddr = order.shippingInfo?.sender?.address || '(Chưa có)';
    const rAddr = order.shippingInfo?.receiver?.address || '(Chưa có)';
    const cargo = order.shippingInfo?.cargo?.items?.length ? order.shippingInfo.cargo.items.map((i: any)=>`${i.name} (${i.weight})`).join('; ') : order.shippingInfo?.cargo?.name || 'Hàng hóa';
    const weight = order.shippingInfo?.cargo?.weight || (order.shippingInfo?.cargo?.weightKg ? `${order.shippingInfo.cargo.weightKg}kg` : '');
    const dt = order.shippingInfo?.deliveryTime || 'Theo thỏa thuận';

    const customerMsg = `💰 [ĐI CHUNG EXPRESS - BÁO GIÁ ĐƠN HÀNG ${order.trackingCode}]
-----------------------------
📍 Điểm lấy: ${sAddr}
🎯 Điểm giao: ${rAddr}
📦 Hàng hóa: ${cargo}${weight ? ` (${weight})` : ''}
⏰ Thời gian: ${dt}

💵 CƯỚC VẬN CHUYỂN TRỌN GÓI: ${formatVnd(customerQuoteVnd)}${params.quoteNote ? `\n📝 Ghi chú: ${params.quoteNote}` : ''}
-----------------------------
👉 Anh/chị vui lòng nhắn "Đồng ý" hoặc "Chốt đơn" để bên em lên lệnh lấy hàng và gửi thông tin thanh toán nhé ạ!`;

    customerNotified = await sendZaloOAReply(targetCustomerId, customerMsg);
    if (customerNotified) {
      await recordCrmInteraction(targetCustomerId, 'bot', customerMsg, order.shippingInfo, 'Báo Giá Từ Điều Phối');
      const sess = zaloUserSessions.get(targetCustomerId);
      if (sess) {
        sess.history.push({ role: 'model', content: customerMsg });
        saveSessionsCache();
      }
    }
  }

  // Gửi xác nhận lại cho DCE Ops
  if (supplierState.dceOpsUserId) {
    const opsAck = `✅ Đã cập nhật báo giá đơn ${order.trackingCode} (${quotedBy}):\n- Giá gốc: ${formatVnd(baseCostVnd)}\n- Giá báo khách: ${formatVnd(customerQuoteVnd)}${customerNotified ? '\n📲 Đã tự động gửi báo giá tới Zalo khách hàng!' : ''}`;
    sendZaloOAReply(supplierState.dceOpsUserId, opsAck).catch(() => {});
  }

  logZaloEvent('outgoing_reply', `Cập nhật báo giá đơn ${order.trackingCode}: ${formatVnd(customerQuoteVnd)} (Gốc: ${formatVnd(baseCostVnd)})`, {
    trackingCode: order.trackingCode,
    baseCostVnd,
    customerQuoteVnd,
    quotedBy,
    customerNotified,
  });

  return {
    success: true,
    order,
    baseCostVnd,
    customerQuoteVnd,
    customerNotified,
  };
}
