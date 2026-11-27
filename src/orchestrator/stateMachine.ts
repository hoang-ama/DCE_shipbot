import { databaseState } from '../database/connection';
import { OrderRecordDB, inMemoryOrders } from '../modules/booking/state';
import { findOrderByTrackingCodeOrSuffix } from '../modules/booking/service';
import type { OrderFormData, PartnerTier } from '../chatbot/agents/dispatchAgent';

export type OrderWorkflowState =
  | 'COLLECTING_INFO'
  | 'WAITING_DCE'
  | 'CLARIFYING_FOR_DCE'
  | 'WAITING_CSDT'
  | 'CLARIFYING_FOR_CSDT'
  | 'QUOTED_WAITING_CUSTOMER'
  | 'COLLECTING_RECIPIENT_PHONE'
  | 'COLLECTING_SENDER_PHONE'
  | 'COLLECTING_PAYMENT_PARTY'
  | 'COLLECTING_PAYMENT_TIME'
  | 'WAITING_DRIVER_PHONE_DCE'
  | 'WAITING_DRIVER_PHONE_CSDT'
  | 'COMPLETED'
  | 'CUSTOMER_DECLINED'
  | 'REJECTED';

export interface DispatchThreadRecord {
  id: string;
  trackingCode: string;
  partnerRole: PartnerTier;
  partnerUserId: string;
  zaloMsgId?: string;
  expectedState: OrderWorkflowState;
  createdAt: string;
}

export const inMemoryDispatchThreads: DispatchThreadRecord[] = [];

export const ALLOWED_TRANSITIONS: Record<OrderWorkflowState, OrderWorkflowState[]> = {
  COLLECTING_INFO: ['WAITING_DCE', 'WAITING_CSDT', 'QUOTED_WAITING_CUSTOMER'],
  WAITING_DCE: ['CLARIFYING_FOR_DCE', 'QUOTED_WAITING_CUSTOMER', 'WAITING_CSDT', 'REJECTED'],
  CLARIFYING_FOR_DCE: ['WAITING_DCE'],
  WAITING_CSDT: ['CLARIFYING_FOR_CSDT', 'QUOTED_WAITING_CUSTOMER', 'REJECTED'],
  CLARIFYING_FOR_CSDT: ['WAITING_CSDT'],
  QUOTED_WAITING_CUSTOMER: ['COLLECTING_RECIPIENT_PHONE', 'CUSTOMER_DECLINED', 'QUOTED_WAITING_CUSTOMER'],
  COLLECTING_RECIPIENT_PHONE: ['COLLECTING_SENDER_PHONE'],
  COLLECTING_SENDER_PHONE: ['COLLECTING_PAYMENT_PARTY'],
  COLLECTING_PAYMENT_PARTY: ['COLLECTING_PAYMENT_TIME'],
  COLLECTING_PAYMENT_TIME: ['WAITING_DRIVER_PHONE_DCE', 'WAITING_DRIVER_PHONE_CSDT'],
  WAITING_DRIVER_PHONE_DCE: ['COMPLETED'],
  WAITING_DRIVER_PHONE_CSDT: ['COMPLETED'],
  COMPLETED: [],
  CUSTOMER_DECLINED: [],
  REJECTED: [],
};

export function canTransitionState(from: OrderWorkflowState | undefined, to: OrderWorkflowState): boolean {
  if (!from) return true;
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

export function orderToFormData(order: OrderRecordDB): OrderFormData {
  const s = order.shippingInfo || {};
  const pickup =
    s.pickupAddress || s.sender?.address || s.dia_chi_lay_hang || 'Chưa rõ';
  const dropoff =
    s.dropoffAddress || s.receiver?.address || s.dia_chi_giao_hang || 'Chưa rõ';
  const cargoParts = [
    s.cargoDescription || s.cargoType || s.thong_tin_hang,
    s.weightKg ? `${s.weightKg}kg` : '',
    s.dimensions || '',
  ].filter(Boolean);
  const cargo = cargoParts.length > 0 ? cargoParts.join(', ') : 'Chưa rõ';
  const time = s.pickupTime || s.deliveryTime || s.thoi_gian_giao_nhan || 'Linh hoạt';

  return {
    dia_chi_lay_hang: String(pickup),
    dia_chi_giao_hang: String(dropoff),
    thong_tin_hang: String(cargo),
    thoi_gian_giao_nhan: String(time),
    thong_tin_bo_sung: order.quoteNote || s.additionalInfo || null,
  };
}

export async function recordDispatchThread(input: {
  trackingCode: string;
  partnerRole: PartnerTier;
  partnerUserId: string;
  zaloMsgId?: string;
  expectedState: OrderWorkflowState;
}): Promise<DispatchThreadRecord> {
  const rec: DispatchThreadRecord = {
    id: `thr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    trackingCode: input.trackingCode,
    partnerRole: input.partnerRole,
    partnerUserId: input.partnerUserId,
    zaloMsgId: input.zaloMsgId,
    expectedState: input.expectedState,
    createdAt: new Date().toISOString(),
  };

  inMemoryDispatchThreads.unshift(rec);
  if (inMemoryDispatchThreads.length > 500) {
    inMemoryDispatchThreads.length = 500;
  }

  if (databaseState.dbPool) {
    try {
      await databaseState.dbPool.query(
        `INSERT INTO order_dispatch_threads (id, tracking_code, partner_role, partner_user_id, zalo_msg_id, expected_state, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [rec.id, rec.trackingCode, rec.partnerRole, rec.partnerUserId, rec.zaloMsgId || null, rec.expectedState]
      );
    } catch (err: any) {
      console.error('[DispatchThread] Failed to persist thread:', err?.message);
    }
  }
  return rec;
}

export async function findThreadByZaloMsgId(zaloMsgId: string): Promise<DispatchThreadRecord | null> {
  if (!zaloMsgId) return null;
  const mem = inMemoryDispatchThreads.find((t) => t.zaloMsgId === zaloMsgId);
  if (mem) return mem;

  if (databaseState.dbPool) {
    try {
      const res = await databaseState.dbPool.query(
        `SELECT * FROM order_dispatch_threads WHERE zalo_msg_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [zaloMsgId]
      );
      if (res.rows.length > 0) {
        const r = res.rows[0];
        return {
          id: r.id,
          trackingCode: r.tracking_code,
          partnerRole: r.partner_role,
          partnerUserId: r.partner_user_id,
          zaloMsgId: r.zalo_msg_id || undefined,
          expectedState: r.expected_state,
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        };
      }
    } catch (_) {}
  }
  return null;
}

export async function updateOrderWorkflow(
  order: OrderRecordDB,
  patch: Partial<OrderRecordDB> & { additionalInfo?: string }
): Promise<OrderRecordDB> {
  Object.assign(order, patch);
  if (patch.additionalInfo) {
    order.shippingInfo = { ...(order.shippingInfo || {}), additionalInfo: patch.additionalInfo };
  }

  const idx = inMemoryOrders.findIndex((o) => o.id === order.id || o.trackingCode === order.trackingCode);
  if (idx >= 0) {
    inMemoryOrders[idx] = order;
  }

  if (databaseState.dbPool) {
    try {
      await databaseState.dbPool.query(
        `UPDATE shipping_orders
         SET status = COALESCE($2, status),
             workflow_state = COALESCE($3, workflow_state),
             assigned_partner = COALESCE($4, assigned_partner),
             customer_phone = COALESCE($5, customer_phone),
             base_cost_vnd = COALESCE($6, base_cost_vnd),
             customer_quote_vnd = COALESCE($7, customer_quote_vnd),
             quoted_by = COALESCE($8, quoted_by),
             quote_note = COALESCE($9, quote_note),
             payment_party = COALESCE($10, payment_party),
             payment_timing = COALESCE($11, payment_timing),
             driver_phone = COALESCE($12, driver_phone),
             negotiation_used = COALESCE($13, negotiation_used),
             additional_info = COALESCE($14, additional_info),
             shipping_info = COALESCE($15, shipping_info)
         WHERE tracking_code = $1 OR id = $16`,
        [
          order.trackingCode,
          patch.status || null,
          patch.workflowState || null,
          patch.assignedPartner ?? null,
          patch.customerPhone || null,
          patch.baseCostVnd ?? null,
          patch.estimatedPrice ?? null,
          patch.quotedBy || null,
          patch.quoteNote || null,
          patch.paymentParty || null,
          patch.paymentTiming || null,
          patch.driverPhone || null,
          patch.negotiationUsed ?? null,
          patch.additionalInfo || null,
          patch.shippingInfo ? JSON.stringify(patch.shippingInfo) : null,
          order.id,
        ]
      );
    } catch (err: any) {
      console.error('[Orchestrator] Failed to update shipping_orders:', err?.message);
    }
  }
  return order;
}

export type PartnerOrderResolution =
  | { status: 'MATCHED'; order: OrderRecordDB; matchedBy: 'quote_reply' | 'tracking_code' | 'single_pending' }
  | { status: 'AMBIGUOUS'; candidates: OrderRecordDB[] }
  | { status: 'NONE' };

/**
 * Resolve which order a partner (DCE Ops or CSĐT) is replying to:
 * 1. Zalo Quote-Reply (`reply_to.msg_id`) matched against `order_dispatch_threads`
 * 2. Tracking code or 4-digit suffix `#XXXX` in message text
 * 3. Single active pending order -> auto-match; >= 2 pending orders -> AMBIGUOUS (prompt for clarification)
 */
export async function resolvePartnerOrderForReply(opts: {
  partnerRole: PartnerTier;
  messageText: string;
  replyToMsgId?: string;
}): Promise<PartnerOrderResolution> {
  // 1. Correlate via Zalo quote-reply message ID
  if (opts.replyToMsgId) {
    const thread = await findThreadByZaloMsgId(opts.replyToMsgId);
    if (thread) {
      const order = await findOrderByTrackingCodeOrSuffix(thread.trackingCode);
      if (order) {
        return { status: 'MATCHED', order, matchedBy: 'quote_reply' };
      }
    }
  }

  // 2. Correlate via explicit tracking code or #XXXX suffix
  const fullCodeMatch = opts.messageText.match(/\b(DCE-[A-Z0-9-]+)\b/i);
  const hashCodeMatch = opts.messageText.match(/#([A-Z0-9]{4,})\b/i);
  const bareFourDigitsMatch = opts.messageText.trim().match(/^(\d{4})\b/);
  const candidateCode = fullCodeMatch?.[1] || hashCodeMatch?.[1] || bareFourDigitsMatch?.[1];

  if (candidateCode) {
    const order = await findOrderByTrackingCodeOrSuffix(candidateCode);
    if (order) {
      return { status: 'MATCHED', order, matchedBy: 'tracking_code' };
    }
  }

  // 3. Gather active orders awaiting this partner
  const activeStatesForRole: OrderWorkflowState[] =
    opts.partnerRole === 'DCE'
      ? ['WAITING_DCE', 'WAITING_DRIVER_PHONE_DCE']
      : ['WAITING_CSDT', 'WAITING_DRIVER_PHONE_CSDT'];

  const pendingOrders = inMemoryOrders.filter((o) => {
    const st = o.workflowState as OrderWorkflowState | undefined;
    if (st && activeStatesForRole.includes(st)) return true;
    // Also allow follow-up replies on QUOTED_WAITING_CUSTOMER if this partner quoted it
    if (st === 'QUOTED_WAITING_CUSTOMER' && o.assignedPartner === opts.partnerRole) return true;
    // Legacy orders without workflowState yet in 'quoting' for DCE
    if (!st && o.status === 'quoting' && opts.partnerRole === 'DCE') return true;
    return false;
  });

  if (pendingOrders.length === 1) {
    return { status: 'MATCHED', order: pendingOrders[0], matchedBy: 'single_pending' };
  }

  if (pendingOrders.length >= 2) {
    return { status: 'AMBIGUOUS', candidates: pendingOrders };
  }

  return { status: 'NONE' };
}

/**
 * Find the most recent active (non-terminal) order belonging to a Zalo customer (or any of their linked aliases)
 * within the current 24h chat session.
 */
export function findActiveCustomerOrder(
  zaloIds: string[],
  chatSessionId?: string
): OrderRecordDB | null {
  const idSet = new Set(zaloIds.filter(Boolean));
  const terminal = new Set<string>(['COMPLETED', 'CUSTOMER_DECLINED', 'REJECTED']);

  return (
    inMemoryOrders.find((o) => {
      if (o.workflowState && terminal.has(o.workflowState)) return false;
      if (chatSessionId && o.chatSessionId && o.chatSessionId !== chatSessionId) return false;
      if (o.zaloUserId && idSet.has(o.zaloUserId)) return true;
      return Boolean(chatSessionId && o.chatSessionId === chatSessionId);
    }) || null
  );
}
