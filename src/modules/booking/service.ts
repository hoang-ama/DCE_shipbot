import {
  calculateDCExpressPriceFromShippingInfo,
  DEFAULT_STANDARD_ROUTES,
  StandardPriceRoute,
  formatVnd,
} from '../pricing/engine';
import { OrderRecordDB, inMemoryOrders } from './state';
import { generateTrackingCode } from '../../chatbot/extraction/express';
import { pricingState } from '../pricing/state';
import { databaseState } from '../../database/connection';
import { notifyDceOps } from '../supplier/service';

export async function saveShippingOrder(orderData: {
  id?: string;
  trackingCode?: string;
  status?: string;
  workflowState?: string;
  assignedPartner?: 'DCE' | 'CSDT' | null;
  customerName?: string;
  customerPhone?: string;
  zaloUserId?: string;
  chatSessionId?: string;
  estimatedPrice?: number;
  baseCostVnd?: number;
  quotedBy?: string;
  quotedAt?: string;
  quoteNote?: string;
  paymentParty?: string;
  paymentTiming?: string;
  driverPhone?: string;
  source?: 'web' | 'zalo';
  shippingInfo: any;
}): Promise<OrderRecordDB> {
  const id = orderData.id || `order-${Date.now()}`;
  const trackingCode = orderData.trackingCode || generateTrackingCode();
  const pricingCheck = calculateDCExpressPriceFromShippingInfo(orderData.shippingInfo, pricingState.activeStandardRoutes);
  const autoPrice = pricingCheck.hasStandardPrice && pricingCheck.recommendedServices[0]
    ? pricingCheck.recommendedServices[0].customerQuoteVnd
    : undefined;
  const autoBaseCost = pricingCheck.hasStandardPrice && pricingCheck.recommendedServices[0]
    ? pricingCheck.recommendedServices[0].baseCostVnd
    : undefined;

  const status = orderData.status || (pricingCheck.hasStandardPrice ? 'created' : 'quoting');
  const customerName = orderData.customerName || orderData.shippingInfo?.sender?.name || '';
  const customerPhone = orderData.customerPhone || orderData.shippingInfo?.sender?.phone || '';
  const source = orderData.source || 'web';
  const shippingInfo = orderData.shippingInfo;
  const createdAt = new Date().toLocaleString('vi-VN');
  const estimatedPrice = orderData.estimatedPrice ?? autoPrice;
  const baseCostVnd = orderData.baseCostVnd ?? autoBaseCost;

  const record: OrderRecordDB = {
    id,
    trackingCode,
    createdAt,
    status,
    workflowState: orderData.workflowState || (pricingCheck.hasStandardPrice ? 'QUOTED_WAITING_CUSTOMER' : 'WAITING_DCE'),
    assignedPartner: orderData.assignedPartner ?? null,
    customerName,
    customerPhone,
    zaloUserId: orderData.zaloUserId,
    chatSessionId: orderData.chatSessionId,
    estimatedPrice,
    baseCostVnd,
    quotedBy: orderData.quotedBy,
    quotedAt: orderData.quotedAt,
    quoteNote: orderData.quoteNote,
    paymentParty: orderData.paymentParty,
    paymentTiming: orderData.paymentTiming,
    driverPhone: orderData.driverPhone,
    source,
    shippingInfo,
  };

  const existingIdx = inMemoryOrders.findIndex((o) => o.id === id || o.trackingCode === trackingCode);
  if (existingIdx >= 0) {
    inMemoryOrders[existingIdx] = record;
  } else {
    inMemoryOrders.unshift(record);
  }

  if (databaseState.dbPool) {
    try {
      await databaseState.dbPool.query(
        `INSERT INTO shipping_orders (id, tracking_code, status, workflow_state, assigned_partner, customer_name, customer_phone, zalo_user_id, chat_session_id, base_cost_vnd, customer_quote_vnd, quoted_by, quote_note, payment_party, payment_timing, driver_phone, source, shipping_info, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
         ON CONFLICT (id) DO UPDATE
         SET tracking_code = EXCLUDED.tracking_code,
             status = EXCLUDED.status,
             workflow_state = COALESCE(EXCLUDED.workflow_state, shipping_orders.workflow_state),
             assigned_partner = COALESCE(EXCLUDED.assigned_partner, shipping_orders.assigned_partner),
             customer_name = EXCLUDED.customer_name,
             customer_phone = EXCLUDED.customer_phone,
             zalo_user_id = COALESCE(EXCLUDED.zalo_user_id, shipping_orders.zalo_user_id),
             chat_session_id = COALESCE(EXCLUDED.chat_session_id, shipping_orders.chat_session_id),
             base_cost_vnd = COALESCE(EXCLUDED.base_cost_vnd, shipping_orders.base_cost_vnd),
             customer_quote_vnd = COALESCE(EXCLUDED.customer_quote_vnd, shipping_orders.customer_quote_vnd),
             quoted_by = COALESCE(EXCLUDED.quoted_by, shipping_orders.quoted_by),
             quote_note = COALESCE(EXCLUDED.quote_note, shipping_orders.quote_note),
             payment_party = COALESCE(EXCLUDED.payment_party, shipping_orders.payment_party),
             payment_timing = COALESCE(EXCLUDED.payment_timing, shipping_orders.payment_timing),
             driver_phone = COALESCE(EXCLUDED.driver_phone, shipping_orders.driver_phone),
             source = EXCLUDED.source,
             shipping_info = EXCLUDED.shipping_info;`,
        [
          id,
          trackingCode,
          status,
          record.workflowState || null,
          record.assignedPartner || null,
          customerName,
          customerPhone,
          orderData.zaloUserId || null,
          orderData.chatSessionId || null,
          baseCostVnd ?? null,
          estimatedPrice ?? null,
          orderData.quotedBy || null,
          orderData.quoteNote || null,
          orderData.paymentParty || null,
          orderData.paymentTiming || null,
          orderData.driverPhone || null,
          source,
          JSON.stringify(shippingInfo),
        ]
      );
      console.log(`[Database] Saved shipping order ${trackingCode} (${source}, status=${status}, state=${record.workflowState}, session=${orderData.chatSessionId || 'N/A'}) to PostgreSQL.`);
    } catch (err: any) {
      console.error('[Database] Failed to save shipping order to PostgreSQL:', err?.message);
    }
  }

  // Tự động đẩy đơn hàng sang Zalo nhân sự vận hành DCE Ops (Cấp 1) để báo giá
  notifyDceOps({
    id,
    trackingCode,
    status,
    customerName,
    customerPhone,
    source,
    shippingInfo,
    workflowState: record.workflowState,
  }).catch((err) => console.error('[DCE Ops Auto-Notify Error]', err?.message));

  return record;
}

export async function findOrderByTrackingCodeOrSuffix(codeInput: string): Promise<OrderRecordDB | null> {
  const clean = String(codeInput || '').trim().toUpperCase();
  if (!clean) return null;

  const memMatch = inMemoryOrders.find(
    (o) => o.trackingCode.toUpperCase() === clean || o.trackingCode.toUpperCase().endsWith(`-${clean}`)
  );
  if (memMatch) return memMatch;

  if (databaseState.dbPool) {
    try {
      const dbRes = await databaseState.dbPool.query(
        `SELECT * FROM shipping_orders WHERE UPPER(tracking_code) = $1 OR UPPER(tracking_code) LIKE $2 ORDER BY created_at DESC LIMIT 1`,
        [clean, `%-${clean}`]
      );
      if (dbRes.rows.length > 0) {
        const r = dbRes.rows[0];
        return {
          id: r.id,
          trackingCode: r.tracking_code,
          createdAt: r.created_at ? new Date(r.created_at).toLocaleString('vi-VN') : new Date().toLocaleString('vi-VN'),
          status: r.status || 'created',
          workflowState: r.workflow_state || undefined,
          assignedPartner: r.assigned_partner || undefined,
          customerName: r.customer_name || '',
          customerPhone: r.customer_phone || '',
          zaloUserId: r.zalo_user_id || undefined,
          chatSessionId: r.chat_session_id || undefined,
          baseCostVnd: r.base_cost_vnd != null ? Number(r.base_cost_vnd) : undefined,
          estimatedPrice: r.customer_quote_vnd != null ? Number(r.customer_quote_vnd) : undefined,
          quotedBy: r.quoted_by || undefined,
          quotedAt: r.quoted_at ? new Date(r.quoted_at).toISOString() : undefined,
          quoteNote: r.quote_note || undefined,
          paymentParty: r.payment_party || undefined,
          paymentTiming: r.payment_timing || undefined,
          driverPhone: r.driver_phone || undefined,
          source: (r.source as 'web' | 'zalo') || 'web',
          shippingInfo: r.shipping_info,
        };
      }
    } catch (_) {}
  }
  return null;
}
