import express from 'express';
import { inMemoryOrders } from '../modules/booking/state';
import { findOrderByTrackingCodeOrSuffix } from '../modules/booking/service';
import { supplierState } from '../modules/supplier/state';
import {
  inMemoryDispatchThreads,
  orderToFormData,
} from './stateMachine';
import {
  handleCustomerZaloWorkflow,
  handlePartnerZaloMessage,
} from './coordinator';

export function createDispatchRouter() {
  const router = express.Router();

  // List active & recent orchestrated orders with thread correlation metadata
  router.get('/orders', (_req, res) => {
    const orders = inMemoryOrders.slice(0, 50).map((o) => {
      const threads = inMemoryDispatchThreads.filter(
        (t) => t.trackingCode === o.trackingCode
      );
      return {
        ...o,
        form: orderToFormData(o),
        threads,
      };
    });

    res.json({
      orders,
      partners: {
        dceOpsConnected: Boolean(supplierState.dceOpsUserId),
        dceOpsPhone: supplierState.dceOpsPhone,
        csdtConnected: Boolean(supplierState.defaultSupplierUserId),
        csdtName: supplierState.defaultSupplierName,
        csdtPhone: supplierState.defaultSupplierPhone,
      },
    });
  });

  // Trigger an operator / partner / simulated customer action against an order via the live orchestrator
  router.post('/orders/:trackingCode/action', async (req, res) => {
    try {
      const { trackingCode } = req.params;
      const { role, message, dryRun } = req.body || {};

      if (!message || !['DCE', 'CSDT', 'CUSTOMER'].includes(role)) {
        return res.status(400).json({ error: 'Yêu cầu role (DCE | CSDT | CUSTOMER) và message hợp lệ' });
      }

      const order = await findOrderByTrackingCodeOrSuffix(trackingCode);
      if (!order) {
        return res.status(404).json({ error: 'Không tìm thấy mã đơn hàng' });
      }

      if (role === 'CUSTOMER') {
        if (!order.zaloUserId && !order.chatSessionId) {
          order.chatSessionId = order.chatSessionId || `WEB-${order.trackingCode}`;
        }
        const result = await handleCustomerZaloWorkflow({
          userIds: order.zaloUserId ? [order.zaloUserId] : [],
          primaryUserId: order.zaloUserId || order.trackingCode,
          chatSessionId: order.chatSessionId,
          messageText: String(message),
          skipZaloSend: Boolean(dryRun),
        });
        return res.json({ ok: true, result });
      }

      const partnerUserId =
        role === 'DCE' ? supplierState.dceOpsUserId : supplierState.defaultSupplierUserId;
      if (!partnerUserId) {
        return res.status(409).json({ error: 'Chưa liên kết tài khoản Zalo của đối tác; đã bỏ qua gửi tin.' });
      }

      const result = await handlePartnerZaloMessage({
        userIds: [partnerUserId],
        primaryUserId: partnerUserId,
        messageText: String(message),
        explicitTrackingCode: order.trackingCode,
        forcedRole: role,
        skipZaloSend: Boolean(dryRun),
      });
      return res.json({ ok: true, result });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Lỗi xử lý điều phối' });
    }
  });

  return router;
}
