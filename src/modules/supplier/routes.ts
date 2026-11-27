import express, { Request, Response } from 'express';
import { Router } from 'express';
import { notifyDceOps } from './service';
import { generateTrackingCode } from '../../chatbot/extraction/express';
import { DCE_OPS_PHONE, supplierState } from './state';
import { databaseState } from '../../database/connection';

export const router = Router();

router.post('/api/orders/notify-ops', async (req: Request, res: Response) => {
  try {
    const { id, trackingCode, status, customerName, customerPhone, source, shippingInfo } = req.body || {};
    if (!shippingInfo) {
      return res.status(400).json({ error: 'shippingInfo is required' });
    }
    const result = await notifyDceOps({
      id,
      trackingCode: trackingCode || shippingInfo?.trackingCode || generateTrackingCode(),
      status: status || 'created',
      customerName: customerName || shippingInfo?.sender?.name,
      customerPhone: customerPhone || shippingInfo?.sender?.phone,
      source: source || 'web',
      shippingInfo,
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

router.get('/api/ops/status', async (_req: Request, res: Response) => {
  return res.json({
    opsPhone: supplierState.dceOpsPhone,
    opsUserId: supplierState.dceOpsUserId || null,
    isLinked: Boolean(supplierState.dceOpsUserId),
    supplierName: supplierState.defaultSupplierName,
    supplierPhone: supplierState.defaultSupplierPhone,
    supplierUserId: supplierState.defaultSupplierUserId || null,
    isSupplierLinked: Boolean(supplierState.defaultSupplierUserId),
  });
});

router.get('/api/config/routing', async (_req: Request, res: Response) => {
  return res.json({
    opsPhone: supplierState.dceOpsPhone,
    opsUserId: supplierState.dceOpsUserId || null,
    isOpsLinked: Boolean(supplierState.dceOpsUserId),
    supplierName: supplierState.defaultSupplierName,
    supplierPhone: supplierState.defaultSupplierPhone,
    supplierUserId: supplierState.defaultSupplierUserId || null,
    isSupplierLinked: Boolean(supplierState.defaultSupplierUserId),
  });
});

router.post('/api/config/routing', async (req: Request, res: Response) => {
  const { opsPhone, supplierName, supplierPhone } = req.body || {};

  if (typeof opsPhone === 'string' && opsPhone.trim()) {
    supplierState.dceOpsPhone = opsPhone.trim();
  }
  if (typeof supplierName === 'string' && supplierName.trim()) {
    supplierState.defaultSupplierName = supplierName.trim();
  }
  if (typeof supplierPhone === 'string' && supplierPhone.trim()) {
    supplierState.defaultSupplierPhone = supplierPhone.trim();
  }

  if (databaseState.dbPool) {
    try {
      const pairs: Array<[string, string]> = [
        ['dce_ops_phone', supplierState.dceOpsPhone],
        ['default_supplier_name', supplierState.defaultSupplierName],
        ['default_supplier_phone', supplierState.defaultSupplierPhone],
      ];
      for (const [k, v] of pairs) {
        await databaseState.dbPool.query(
          `INSERT INTO bot_settings (key, value, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
          [k, v]
        );
      }
    } catch (e: any) {
      console.error('[API /api/config/routing] DB save error:', e?.message);
    }
  }

  return res.json({
    success: true,
    opsPhone: supplierState.dceOpsPhone,
    opsUserId: supplierState.dceOpsUserId || null,
    isOpsLinked: Boolean(supplierState.dceOpsUserId),
    supplierName: supplierState.defaultSupplierName,
    supplierPhone: supplierState.defaultSupplierPhone,
    supplierUserId: supplierState.defaultSupplierUserId || null,
    isSupplierLinked: Boolean(supplierState.defaultSupplierUserId),
    message: 'Đã lưu cấu hình Điều phối Ops & Nhà cung cấp mặc định thành công!',
  });
});

router.post('/api/ops/bind', async (req: Request, res: Response) => {
  const { userId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  supplierState.dceOpsUserId = String(userId).trim();
  if (databaseState.dbPool) {
    databaseState.dbPool.query(
      `INSERT INTO bot_settings (key, value, updated_at) VALUES ('dce_ops_user_id', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
      [supplierState.dceOpsUserId]
    ).catch(() => {});
  }
  return res.json({
    success: true,
    opsPhone: DCE_OPS_PHONE,
    opsUserId: supplierState.dceOpsUserId,
    message: `Đã liên kết Zalo user_id ${supplierState.dceOpsUserId} cho DCE Ops (${DCE_OPS_PHONE}) thành công.`,
  });
});
