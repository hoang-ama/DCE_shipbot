import express, { Request, Response } from 'express';
import {
  calculateDCExpressPriceFromShippingInfo,
  DEFAULT_STANDARD_ROUTES,
  StandardPriceRoute,
  formatVnd,
} from './engine';
import { Router } from 'express';
import { applyOrderQuote, parseVietnameseMoney } from './quotes';
import { supplierState } from '../supplier/state';
import { findOrderByTrackingCodeOrSuffix } from '../booking/service';
import { pricingState } from './state';
import { databaseState } from '../../database/connection';

export const router = Router();

router.post('/api/orders/:trackingCode/quote', async (req: Request, res: Response) => {
  try {
    const { trackingCode } = req.params;
    const { baseCostVnd, applyMargin, quotedBy, quoteNote } = req.body || {};
    const parsedAmount = typeof baseCostVnd === 'number' ? baseCostVnd : parseVietnameseMoney(String(baseCostVnd || ''));
    const result = await applyOrderQuote({
      codeOrSuffix: trackingCode,
      inputAmountVnd: parsedAmount,
      applyMargin: applyMargin !== false,
      quotedBy: quotedBy || `DCE Ops (${supplierState.dceOpsPhone})`,
      quoteNote,
    });
    if (!result.success) {
      return res.status(404).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

router.get('/quote/:trackingCode', async (req: Request, res: Response) => {
  const { trackingCode } = req.params;
  const order = await findOrderByTrackingCodeOrSuffix(trackingCode);
  if (!order) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="vi">
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Không tìm thấy đơn</title></head>
      <body style="font-family:sans-serif;padding:32px;text-align:center;background:#f8fafc;color:#1e293b;">
        <h2>❌ Không tìm thấy đơn hàng ${trackingCode}</h2>
        <p>Vui lòng kiểm tra lại mã vận đơn hoặc liên hệ DCE Ops (${supplierState.dceOpsPhone}).</p>
      </body></html>
    `);
  }

  const sAddr = order.shippingInfo?.sender?.address || '(Chưa có)';
  const rAddr = order.shippingInfo?.receiver?.address || '(Chưa có)';
  const cargo = order.shippingInfo?.cargo?.items?.length ? order.shippingInfo.cargo.items.map((i: any)=>`${i.name} (${i.weight})`).join('; ') : order.shippingInfo?.cargo?.name || 'Hàng hóa';
  const weight = order.shippingInfo?.cargo?.weight || (order.shippingInfo?.cargo?.weightKg ? `${order.shippingInfo.cargo.weightKg} kg` : 'Theo thực tế');
  const dims = order.shippingInfo?.cargo?.dimensions?.raw || 'Tiêu chuẩn';
  const notes = order.shippingInfo?.cargo?.specialNotes || 'Không có';
  const dt = order.shippingInfo?.deliveryTime || 'Thỏa thuận';

  return res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Báo Giá Nhanh - ${order.trackingCode} | Đi Chung Express</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f1f5f9; margin: 0; padding: 16px; color: #0f172a; }
        .card { max-width: 480px; margin: 0 auto; background: #fff; border-radius: 16px; box-shadow: 0 10px 25px rgba(15,23,42,0.08); overflow: hidden; border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #1d4ed8, #4338ca); color: #fff; padding: 20px; }
        .badge { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; margin-bottom: 6px; }
        .body { padding: 20px; }
        .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; font-size: 13.5px; line-height: 1.55; margin-bottom: 18px; }
        .label { font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 6px; display: block; }
        input, select, textarea { width: 100%; box-sizing: border-box; padding: 11px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font-size: 15px; margin-bottom: 12px; }
        .preview { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; padding: 12px; border-radius: 10px; font-size: 13px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; }
        .btn { width: 100%; background: #2563eb; color: #fff; border: none; padding: 14px; border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer; }
        .btn:disabled { opacity: 0.6; }
        .msg { margin-top: 14px; padding: 12px; border-radius: 10px; font-size: 13.5px; display: none; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="badge">ĐI CHUNG EXPRESS — QUICK QUOTE</div>
          <h2 style="margin:0;font-size:20px;">Đơn: ${order.trackingCode}</h2>
          <div style="font-size:12px;opacity:0.85;margin-top:4px;">Trạng thái: ${order.status === 'quoted' ? 'Đã báo giá (' + formatVnd(order.estimatedPrice || 0) + ')' : 'Chờ báo giá'}</div>
        </div>
        <div class="body">
          <div class="info-box">
            <div><strong>📍 Lấy hàng:</strong> ${sAddr}</div>
            <div style="margin-top:6px;"><strong>🎯 Giao hàng:</strong> ${rAddr}</div>
            <div style="margin-top:6px;"><strong>📦 Hàng hóa:</strong> ${cargo} | ${weight} | KT: ${dims}</div>
            <div style="margin-top:6px;"><strong>⏰ Thời gian:</strong> ${dt}</div>
            <div style="margin-top:6px;"><strong>📝 Ghi chú:</strong> ${notes}</div>
          </div>

          <form id="quoteForm">
            <label class="label">Người báo giá</label>
            <select id="quotedBy">
              <option value="DCE Ops (${supplierState.dceOpsPhone})">DCE Ops (${supplierState.dceOpsPhone})</option>
              <option value="${supplierState.defaultSupplierName} (${supplierState.defaultSupplierPhone})">${supplierState.defaultSupplierName} (${supplierState.defaultSupplierPhone})</option>
            </select>

            <label class="label">Giá cước nhập (VNĐ) — VD: 450000</label>
            <input type="number" id="baseCost" min="10000" step="1000" required placeholder="Nhập số tiền VNĐ..." value="${order.baseCostVnd || ''}" />

            <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:14px;cursor:pointer;">
              <input type="checkbox" id="applyMargin" checked style="width:auto;margin:0;" />
              <span>Tự động cộng <strong>+30% Margin</strong> để báo Khách hàng</span>
            </label>

            <div class="preview">
              <span>Giá dự kiến báo Khách:</span>
              <strong id="customerPreview" style="font-size:17px;">0 đ</strong>
            </div>

            <label class="label">Ghi chú thêm (tùy chọn)</label>
            <textarea id="quoteNote" rows="2" placeholder="VD: Đã gồm phí bốc xếp, xe tải 1.25 tấn...">${order.quoteNote || ''}</textarea>

            <button type="submit" class="btn" id="submitBtn">✅ Xác nhận & Gửi báo giá</button>
          </form>
          <div id="resultMsg" class="msg"></div>
        </div>
      </div>

      <script>
        const baseInput = document.getElementById('baseCost');
        const marginCheck = document.getElementById('applyMargin');
        const previewEl = document.getElementById('customerPreview');
        function updatePreview() {
          const val = parseFloat(baseInput.value || '0');
          if (!val || val <= 0) { previewEl.textContent = '0 đ'; return; }
          const finalPrice = marginCheck.checked ? Math.round((val * 1.3) / 1000) * 1000 : Math.round(val);
          previewEl.textContent = finalPrice.toLocaleString('vi-VN') + ' đ';
        }
        baseInput.addEventListener('input', updatePreview);
        marginCheck.addEventListener('change', updatePreview);
        updatePreview();

        document.getElementById('quoteForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = document.getElementById('submitBtn');
          const msg = document.getElementById('resultMsg');
          btn.disabled = true;
          btn.textContent = 'Đang lưu báo giá...';
          try {
            const res = await fetch('/api/orders/${encodeURIComponent(order.trackingCode)}/quote', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                baseCostVnd: Number(baseInput.value),
                applyMargin: marginCheck.checked,
                quotedBy: document.getElementById('quotedBy').value,
                quoteNote: document.getElementById('quoteNote').value.trim()
              })
            });
            const data = await res.json();
            msg.style.display = 'block';
            if (data.success) {
              msg.style.background = '#ecfdf5';
              msg.style.color = '#065f46';
              msg.innerHTML = '🎉 <strong>Đã lưu báo giá thành công!</strong><br/>Giá báo khách: <strong>' + Number(data.customerQuoteVnd).toLocaleString('vi-VN') + ' đ</strong>' + (data.customerNotified ? '<br/>📲 Đã tự động gửi tin nhắn báo giá tới Zalo Khách hàng!' : '');
            } else {
              msg.style.background = '#fef2f2';
              msg.style.color = '#991b1b';
              msg.textContent = '❌ Lỗi: ' + (data.error || 'Không thể lưu');
            }
          } catch (err) {
            msg.style.display = 'block';
            msg.style.background = '#fef2f2';
            msg.style.color = '#991b1b';
            msg.textContent = '❌ Lỗi kết nối máy chủ';
          } finally {
            btn.disabled = false;
            btn.textContent = '✅ Xác nhận & Gửi báo giá';
          }
        });
      </script>
    </body>
    </html>
  `);
});

router.post('/api/pricing/calculate', async (req: Request, res: Response) => {
  try {
    const { shippingInfo } = req.body || {};
    if (!shippingInfo) {
      return res.status(400).json({ error: 'shippingInfo is required' });
    }
    const result = calculateDCExpressPriceFromShippingInfo(shippingInfo, pricingState.activeStandardRoutes);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

router.get('/api/pricing/routes', async (_req: Request, res: Response) => {
  return res.json({ success: true, routes: pricingState.activeStandardRoutes });
});

router.post('/api/pricing/routes', async (req: Request, res: Response) => {
  try {
    const route: StandardPriceRoute = req.body;
    if (!route || !route.routeCode || !route.originProvince || !route.destinationProvince) {
      return res.status(400).json({ error: 'routeCode, originProvince, destinationProvince are required' });
    }
    const id = route.id || `route-${route.routeCode.toLowerCase()}`;
    const normalized: StandardPriceRoute = {
      ...route,
      id,
      marginPercent: typeof route.marginPercent === 'number' ? route.marginPercent : 30,
      isActive: route.isActive !== false,
    };

    const idx = pricingState.activeStandardRoutes.findIndex((r) => r.routeCode === normalized.routeCode);
    if (idx >= 0) {
      pricingState.activeStandardRoutes[idx] = normalized;
    } else {
      pricingState.activeStandardRoutes.push(normalized);
    }

    if (databaseState.dbPool) {
      await databaseState.dbPool.query(
        `INSERT INTO standard_price_routes (id, route_code, name, origin_province, destination_province, service_code, service_name, estimated_transit_time, margin_percent, tiers, is_active, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (route_code) DO UPDATE
         SET name = EXCLUDED.name,
             origin_province = EXCLUDED.origin_province,
             destination_province = EXCLUDED.destination_province,
             service_code = EXCLUDED.service_code,
             service_name = EXCLUDED.service_name,
             estimated_transit_time = EXCLUDED.estimated_transit_time,
             margin_percent = EXCLUDED.margin_percent,
             tiers = EXCLUDED.tiers,
             is_active = EXCLUDED.is_active,
             updated_at = NOW();`,
        [
          normalized.id,
          normalized.routeCode,
          normalized.name,
          normalized.originProvince,
          normalized.destinationProvince,
          normalized.serviceCode,
          normalized.serviceName,
          normalized.estimatedTransitTime,
          normalized.marginPercent,
          JSON.stringify(normalized.tiers),
          normalized.isActive,
        ]
      );
    }

    return res.json({ success: true, route: normalized, routes: pricingState.activeStandardRoutes });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});
