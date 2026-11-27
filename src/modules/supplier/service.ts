import { runtime } from '../../config/runtime';
import { inMemoryOrders } from '../booking/state';
import { databaseState } from '../../database/connection';
import { calculateDCExpressPriceFromShippingInfo, formatVnd } from '../pricing/engine';
import { pricingState } from '../pricing/state';
import { supplierState } from './state';
import { buildDispatchFormMessage } from '../../chatbot/agents/dispatchAgent';
import { orderToFormData } from '../../orchestrator/stateMachine';
import { dispatchMessageToPartner } from '../../orchestrator/coordinator';

export async function notifyDceOps(orderData: {
  id?: string;
  trackingCode: string;
  status?: string;
  workflowState?: string;
  customerName?: string;
  customerPhone?: string;
  source?: string;
  shippingInfo: any;
}) {
  const pricingCheck = calculateDCExpressPriceFromShippingInfo(
    orderData.shippingInfo,
    pricingState.activeStandardRoutes
  );

  const form = orderToFormData({
    id: orderData.id || `ord-${orderData.trackingCode}`,
    trackingCode: orderData.trackingCode,
    createdAt: new Date().toISOString(),
    status: orderData.status || 'quoting',
    customerName: orderData.customerName,
    customerPhone: orderData.customerPhone,
    source: (orderData.source as 'web' | 'zalo') || 'web',
    shippingInfo: orderData.shippingInfo,
  });

  const baseUrl = process.env.APP_URL || 'http://localhost:2700';
  const memOrder = inMemoryOrders.find(
    (o) => o.trackingCode === orderData.trackingCode || (orderData.id && o.id === orderData.id)
  );

  // If route has standard pricing, notify DCE Ops as informational update only (do not disturb CSĐT)
  if (pricingCheck.hasStandardPrice && pricingCheck.recommendedServices[0]) {
    const rec = pricingCheck.recommendedServices[0];
    const infoMsg =
      `📦 [ĐƠN ĐÃ BÁO GIÁ CHUẨN - #${orderData.trackingCode}]\n` +
      `• Tuyến: ${form.dia_chi_lay_hang} -> ${form.dia_chi_giao_hang}\n` +
      `• Hàng: ${form.thong_tin_hang} | TG: ${form.thoi_gian_giao_nhan}\n` +
      `• Khách báo: ${formatVnd(rec.customerQuoteVnd)} (Giá gốc: ${formatVnd(rec.baseCostVnd)})`;

    if (supplierState.dceOpsUserId) {
      await dispatchMessageToPartner({
        tier: 'DCE',
        trackingCode: orderData.trackingCode,
        text: infoMsg,
        expectedState: 'QUOTED_WAITING_CUSTOMER',
      });
    }
    return { success: true, hasStandardPrice: true, notifiedTier: 'DCE' };
  }

  // Exception/out-of-route order: dispatch Tier 1 (DCE Ops) first; only fallback to CSĐT if DCE Ops is unbound
  if (supplierState.dceOpsUserId) {
    const msg = buildDispatchFormMessage({
      trackingCode: orderData.trackingCode,
      tier: 'DCE',
      form,
      baseUrl,
    });
    const sentRes = await dispatchMessageToPartner({
      tier: 'DCE',
      trackingCode: orderData.trackingCode,
      text: msg,
      expectedState: 'WAITING_DCE',
    });

    if (memOrder) {
      memOrder.workflowState = 'WAITING_DCE';
      memOrder.assignedPartner = 'DCE';
    }
    if (databaseState.dbPool) {
      databaseState.dbPool
        .query(
          `UPDATE shipping_orders SET ops_notified = TRUE, ops_notified_at = NOW(), workflow_state = 'WAITING_DCE', assigned_partner = 'DCE' WHERE tracking_code = $1`,
          [orderData.trackingCode]
        )
        .catch(() => {});
    }

    return {
      success: true,
      hasStandardPrice: false,
      notifiedTier: 'DCE',
      sent: sentRes.sent,
      messageId: sentRes.messageId,
    };
  }

  if (supplierState.defaultSupplierUserId) {
    const msg = buildDispatchFormMessage({
      trackingCode: orderData.trackingCode,
      tier: 'CSDT',
      form,
      baseUrl,
    });
    const sentRes = await dispatchMessageToPartner({
      tier: 'CSDT',
      trackingCode: orderData.trackingCode,
      text: msg,
      expectedState: 'WAITING_CSDT',
    });

    if (memOrder) {
      memOrder.workflowState = 'WAITING_CSDT';
      memOrder.assignedPartner = 'CSDT';
    }
    if (databaseState.dbPool) {
      databaseState.dbPool
        .query(
          `UPDATE shipping_orders SET ops_notified = TRUE, ops_notified_at = NOW(), workflow_state = 'WAITING_CSDT', assigned_partner = 'CSDT' WHERE tracking_code = $1`,
          [orderData.trackingCode]
        )
        .catch(() => {});
    }

    return {
      success: true,
      hasStandardPrice: false,
      notifiedTier: 'CSDT',
      sent: sentRes.sent,
      messageId: sentRes.messageId,
    };
  }

  return {
    success: false,
    hasStandardPrice: false,
    reason: 'Chưa liên kết Zalo DCE Ops (#ops) hoặc CSĐT (#supplier)',
  };
}
