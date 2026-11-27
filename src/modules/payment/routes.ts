import express, { Request, Response } from 'express';
import {
  calculateDCExpressPriceFromShippingInfo,
  DEFAULT_STANDARD_ROUTES,
  StandardPriceRoute,
  formatVnd,
} from '../pricing/engine';
import { Router } from 'express';
import { PAYMENT_WEBHOOK_SECRET, paymentState } from './state';
import { databaseState } from '../../database/connection';
import { completeOrderPaymentAndDispatch } from './dispatch';
import { findOrderByTrackingCodeOrSuffix } from '../booking/service';
import { buildVietQrUrl } from './service';

export const router = Router();

router.get('/api/config/payment', (_req: Request, res: Response) => {
  return res.json({
    bankId: paymentState.paymentBankId,
    accountNo: paymentState.paymentAccountNo,
    accountName: paymentState.paymentAccountName,
  });
});

router.post('/api/config/payment', async (req: Request, res: Response) => {
  const { bankId, accountNo, accountName } = req.body || {};
  if (typeof bankId === 'string' && bankId.trim()) paymentState.paymentBankId = bankId.trim().toUpperCase();
  if (typeof accountNo === 'string' && accountNo.trim()) paymentState.paymentAccountNo = accountNo.trim();
  if (typeof accountName === 'string' && accountName.trim()) paymentState.paymentAccountName = accountName.trim().toUpperCase();

  if (databaseState.dbPool) {
    try {
      const pairs: Array<[string, string]> = [
        ['payment_bank_id', paymentState.paymentBankId],
        ['payment_account_no', paymentState.paymentAccountNo],
        ['payment_account_name', paymentState.paymentAccountName],
      ];
      for (const [k, v] of pairs) {
        await databaseState.dbPool.query(
          `INSERT INTO bot_settings (key, value, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
          [k, v]
        );
      }
    } catch (e: any) {
      console.error('[API /api/config/payment] DB save error:', e?.message);
    }
  }

  return res.json({
    success: true,
    bankId: paymentState.paymentBankId,
    accountNo: paymentState.paymentAccountNo,
    accountName: paymentState.paymentAccountName,
    message: 'Đã lưu cấu hình tài khoản ngân hàng VietQR thành công!',
  });
});

router.post('/api/orders/:trackingCode/payment', async (req: Request, res: Response) => {
  try {
    const { trackingCode } = req.params;
    const { method, paymentRef } = req.body || {};
    const resolvedMethod = method === 'cod' ? 'cod' : 'vietqr';
    const result = await completeOrderPaymentAndDispatch({
      codeOrSuffix: trackingCode,
      method: resolvedMethod,
      paymentRef,
    });
    if (!result.success) {
      return res.status(404).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

router.post('/api/payment/vietqr-webhook', async (req: Request, res: Response) => {
  try {
    if (PAYMENT_WEBHOOK_SECRET) {
      const incomingSecret = req.headers['x-api-key'] || req.headers['authorization'] || req.query.secret;
      if (String(incomingSecret || '').replace(/^Bearer\s+/i, '') !== PAYMENT_WEBHOOK_SECRET) {
        return res.status(401).json({ success: false, error: 'Invalid webhook secret' });
      }
    }

    const body = req.body || {};
    // Hỗ trợ chuẩn payload của SePAY (content, transferAmount, referenceCode) hoặc Casso (data[].description, amount)
    const txList = Array.isArray(body.data) ? body.data : [body];
    const processed: string[] = [];

    for (const tx of txList) {
      const content = String(tx.content || tx.description || tx.remark || '').toUpperCase();
      const refCode = String(tx.referenceCode || tx.id || tx.tid || `BANK-${Date.now().toString().slice(-6)}`);
      const codeMatch = content.match(/VN-LOG-\d{4}-\d{4}/i) || content.match(/VNLOG\d{8}/i);
      if (codeMatch) {
        let code = codeMatch[0].toUpperCase();
        if (code.startsWith('VNLOG')) {
          code = `VN-LOG-${code.slice(5, 9)}-${code.slice(9, 13)}`;
        }
        const dispatchRes = await completeOrderPaymentAndDispatch({
          codeOrSuffix: code,
          method: 'vietqr',
          paymentRef: refCode,
        });
        if (dispatchRes.success) {
          processed.push(code);
        }
      }
    }

    return res.json({ success: true, processed });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

router.get('/pay/:trackingCode', async (req: Request, res: Response) => {
  const { trackingCode } = req.params;
  const order = await findOrderByTrackingCodeOrSuffix(trackingCode);
  if (!order) {
    return res.status(404).send(`
      <!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Không tìm thấy đơn</title></head>
      <body style="font-family:sans-serif;padding:32px;text-align:center;background:#f8fafc;">
        <h2>❌ Không tìm thấy đơn hàng ${trackingCode}</h2>
      </body></html>
    `);
  }

  const amount = order.estimatedPrice || 0;
  const qrUrl = buildVietQrUrl(amount, order.trackingCode);
  const sAddr = order.shippingInfo?.sender?.address || '(Chưa có)';
  const rAddr = order.shippingInfo?.receiver?.address || '(Chưa có)';
  const sContact = [order.shippingInfo?.sender?.name || order.customerName, order.shippingInfo?.sender?.phone || order.customerPhone].filter(Boolean).join(' - ') || '(Chưa có)';
  const cargo = order.shippingInfo?.cargo?.name || 'Hàng hóa';
  const isAlreadyDone = order.status === 'dispatched' || order.paymentStatus === 'paid' || order.paymentStatus === 'cod_pending';

  return res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Thanh Toán Đơn ${order.trackingCode} | Đi Chung Express</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f1f5f9; margin: 0; padding: 16px; color: #0f172a; }
        .card { max-width: 460px; margin: 0 auto; background: #fff; border-radius: 18px; box-shadow: 0 12px 30px rgba(15,23,42,0.08); overflow: hidden; border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #059669, #0d9488); color: #fff; padding: 20px; text-align: center; }
        .body { padding: 20px; }
        .amount { font-size: 28px; font-weight: 900; color: #059669; text-align: center; margin: 6px 0 14px; }
        .qr-box { text-align: center; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 14px; padding: 14px; margin-bottom: 16px; }
        .qr-box img { max-width: 240px; width: 100%; border-radius: 10px; }
        .info { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; font-size: 13px; line-height: 1.6; margin-bottom: 16px; }
        .btn { width: 100%; border: none; padding: 13px; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; margin-bottom: 8px; }
        .btn-primary { background: #059669; color: #fff; }
        .btn-cod { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
        .status-done { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; padding: 14px; border-radius: 12px; text-align: center; font-weight: 700; margin-bottom: 14px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.5px;opacity:0.9;">ĐI CHUNG EXPRESS — THANH TOÁN ĐƠN HÀNG</div>
          <h2 style="margin:6px 0 0;font-size:20px;">${order.trackingCode}</h2>
        </div>
        <div class="body">
          ${isAlreadyDone ? `<div class="status-done">${order.paymentStatus === 'paid' ? '✅ ĐÃ THANH TOÁN VIETQR & PHÁT LỆNH LẤY HÀNG' : '✅ ĐÃ CHỐT THANH TOÁN COD & PHÁT LỆNH LẤY HÀNG'}</div>` : ''}
          <div style="text-align:center;font-size:12px;color:#64748b;">Tổng cước thanh toán</div>
          <div class="amount">${amount > 0 ? formatVnd(amount) : 'Chờ báo giá'}</div>

          ${amount > 0 ? `
          <div class="qr-box">
            <img src="${qrUrl}" alt="VietQR ${order.trackingCode}" />
            <div style="font-size:12px;color:#334155;margin-top:8px;">
              <strong>${paymentState.paymentBankId}</strong> • STK: <strong>${paymentState.paymentAccountNo}</strong><br/>
              Chủ TK: <strong>${paymentState.paymentAccountName}</strong><br/>
              Nội dung CK: <strong style="color:#059669;">${order.trackingCode}</strong>
            </div>
          </div>` : ''}

          <div class="info">
            <div><strong>👤 Người gửi/lấy:</strong> ${sContact}</div>
            <div><strong>📍 Lấy tại:</strong> ${sAddr}</div>
            <div><strong>🎯 Giao đến:</strong> ${rAddr}</div>
            <div><strong>📦 Hàng hóa:</strong> ${cargo}</div>
            <div><strong>⏰ Thời gian:</strong> ${order.shippingInfo?.deliveryTime || 'Theo thỏa thuận'}</div>
          </div>

          <button class="btn btn-primary" onclick="confirmPayment('vietqr')">✅ Tôi đã chuyển khoản xong (Xác nhận & Lên lệnh)</button>
          <button class="btn btn-cod" onclick="confirmPayment('cod')">💵 Chọn Thanh toán COD / Tiền mặt khi giao nhận</button>
          <div id="payMsg" style="margin-top:10px;font-size:13px;text-align:center;"></div>
        </div>
      </div>

      <script>
        async function confirmPayment(method) {
          const msg = document.getElementById('payMsg');
          msg.textContent = 'Đang xử lý và phát lệnh điều phối...';
          try {
            const res = await fetch('/api/orders/${encodeURIComponent(order.trackingCode)}/payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ method })
            });
            const data = await res.json();
            if (data.success) {
              msg.innerHTML = '<div style="color:#059669;font-weight:700;padding:10px;background:#ecfdf5;border-radius:10px;">🎉 Thành công! Đã phát hành Lệnh Điều Phối tới Khách hàng, DCE Ops & Nhà xe!</div>';
              setTimeout(() => location.reload(), 1200);
            } else {
              msg.textContent = '❌ Lỗi: ' + (data.error || 'Không thể xử lý');
            }
          } catch (e) {
            msg.textContent = '❌ Lỗi kết nối máy chủ';
          }
        }
      </script>
    </body>
    </html>
  `);
});
