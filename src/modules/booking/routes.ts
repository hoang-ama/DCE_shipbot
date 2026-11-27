import express, { Request, Response } from 'express';
import { Router } from 'express';
import { databaseState } from '../../database/connection';
import { inMemoryOrders } from './state';
import { saveShippingOrder } from './service';

export const router = Router();

router.get('/api/orders', async (_req: Request, res: Response) => {
  if (databaseState.dbPool) {
    try {
      const result = await databaseState.dbPool.query(`
        SELECT id, tracking_code, created_at, status, customer_name, customer_phone, zalo_user_id, base_cost_vnd, customer_quote_vnd, quoted_by, quoted_at, quote_note, payment_method, payment_status, paid_at, payment_ref, negotiation_used, source, shipping_info
        FROM shipping_orders
        ORDER BY created_at DESC
        LIMIT 100
      `);
      const orders = result.rows.map((r) => ({
        id: r.id,
        trackingCode: r.tracking_code,
        createdAt: r.created_at ? new Date(r.created_at).toLocaleString('vi-VN') : '',
        status: r.status,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        zaloUserId: r.zalo_user_id || undefined,
        baseCostVnd: r.base_cost_vnd != null ? Number(r.base_cost_vnd) : undefined,
        estimatedPrice: r.customer_quote_vnd != null ? Number(r.customer_quote_vnd) : undefined,
        quotedBy: r.quoted_by || undefined,
        quotedAt: r.quoted_at ? new Date(r.quoted_at).toISOString() : undefined,
        quoteNote: r.quote_note || undefined,
        paymentMethod: r.payment_method || undefined,
        paymentStatus: r.payment_status || 'unpaid',
        paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : undefined,
        paymentRef: r.payment_ref || undefined,
        negotiationUsed: Boolean(r.negotiation_used),
        source: r.source,
        shippingInfo: r.shipping_info,
      }));
      return res.json({ success: true, orders, source: 'postgresql' });
    } catch (err: any) {
      console.error('[API /api/orders] Error fetching orders from DB:', err?.message);
    }
  }
  return res.json({ success: true, orders: inMemoryOrders, source: 'memory' });
});

router.post('/api/orders', async (req: Request, res: Response) => {
  try {
    const { id, trackingCode, status, customerName, customerPhone, source, shippingInfo } = req.body;
    if (!shippingInfo) {
      return res.status(400).json({ error: 'shippingInfo is required' });
    }
    const saved = await saveShippingOrder({
      id,
      trackingCode,
      status,
      customerName,
      customerPhone,
      source: source || 'web',
      shippingInfo,
    });
    return res.json({ success: true, order: saved });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

router.delete('/api/orders/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const idx = inMemoryOrders.findIndex((o) => o.id === id);
  if (idx >= 0) inMemoryOrders.splice(idx, 1);
  if (databaseState.dbPool) {
    try {
      await databaseState.dbPool.query(`DELETE FROM shipping_orders WHERE id = $1`, [id]);
    } catch (err: any) {
      console.error('[API DELETE /api/orders/:id] Error:', err?.message);
    }
  }
  return res.json({ success: true, deletedId: id });
});

router.delete('/api/orders', async (_req: Request, res: Response) => {
  inMemoryOrders.length = 0;
  if (databaseState.dbPool) {
    try {
      await databaseState.dbPool.query(`DELETE FROM shipping_orders`);
    } catch (err: any) {
      console.error('[API DELETE ALL /api/orders] Error:', err?.message);
    }
  }
  return res.json({ success: true, message: 'All orders cleared' });
});
