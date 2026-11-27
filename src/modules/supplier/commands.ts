import { supplierEnabled } from '../../config/env';
import { supplierState } from './state';
import { databaseState } from '../../database/connection';
import { sendZaloOAReply } from '../zalo/sender';
import { recordCrmInteraction } from '../customer/service';
import { logZaloEvent } from '../zalo/events';
import { applyOrderQuote, parseVietnameseMoney } from '../pricing/quotes';
import { formatVnd } from '../pricing/engine';

export async function handleSupplierCommand(userId: string, trimmed: string): Promise<boolean> {
      const isOpsCommand =
        /^(?:#ops|ops|#dceops|dce\s*ops)(?:\s+(0\d{9,10}|\+?84\d{9,10}))?$/i.test(trimmed) ||
        trimmed.toLowerCase() === '#ops' ||
        trimmed.toLowerCase() === 'ops' ||
        (supplierState.dceOpsPhone && trimmed.includes(supplierState.dceOpsPhone));

      if (isOpsCommand && supplierEnabled) {
        supplierState.dceOpsUserId = userId;
        console.log(`[DCE Ops] Linked Zalo User ID: ${userId} to DCE Ops (${supplierState.dceOpsPhone})`);

        if (databaseState.dbPool) {
          databaseState.dbPool.query(
            `INSERT INTO bot_settings (key, value, updated_at)
             VALUES ('dce_ops_user_id', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
            [userId]
          ).catch(() => {});

          databaseState.dbPool.query(
            `UPDATE crm_customers SET name = $1, phone = $2 WHERE user_id = $3;`,
            [`DCE Ops (${supplierState.dceOpsPhone})`, supplierState.dceOpsPhone, userId]
          ).catch(() => {});
        }

        const reply = `✅ Đã kết nối tài khoản Zalo này với vai trò: ĐIỀU PHỐI VẬN HÀNH DCE (Hotline: ${supplierState.dceOpsPhone})!\n\nTừ bây giờ, bất cứ khi nào có đơn vận chuyển mới (từ Web hoặc khách chốt qua Zalo OA), hệ thống sẽ TỰ ĐỘNG gửi thông tin báo giá chi tiết về Zalo này để bạn gửi ngay cho các Supplier/Nhà xe đối tác.\n\nCảm ơn bạn!`;

        await sendZaloOAReply(userId, reply);
        await recordCrmInteraction(userId, 'bot', reply, {}, 'Xác Nhận Kích Hoạt DCE Ops');
        logZaloEvent('token_update', `Đã liên kết Zalo user_id ${userId} cho DCE Ops (${supplierState.dceOpsPhone})`);
        return true;
      }

      const isSupplierCommand =
        /^(?:#supplier|supplier|#ncc)(?:\s+(0\d{9,10}|\+?84\d{9,10}))?$/i.test(trimmed) ||
        trimmed.toLowerCase() === '#supplier' ||
        (supplierState.defaultSupplierPhone && trimmed.includes(supplierState.defaultSupplierPhone));

      if (isSupplierCommand && supplierEnabled) {
        supplierState.defaultSupplierUserId = userId;
        console.log(`[Default Supplier] Linked Zalo User ID: ${userId} to ${supplierState.defaultSupplierName} (${supplierState.defaultSupplierPhone})`);

        if (databaseState.dbPool) {
          databaseState.dbPool.query(
            `INSERT INTO bot_settings (key, value, updated_at)
             VALUES ('default_supplier_user_id', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
            [userId]
          ).catch(() => {});

          databaseState.dbPool.query(
            `UPDATE crm_customers SET name = $1, phone = $2 WHERE user_id = $3;`,
            [`NCC: ${supplierState.defaultSupplierName}`, supplierState.defaultSupplierPhone, userId]
          ).catch(() => {});
        }

        const reply = `✅ Đã kết nối tài khoản Zalo này với vai trò: NHÀ CUNG CẤP MẶC ĐỊNH — ${supplierState.defaultSupplierName} (Zalo: ${supplierState.defaultSupplierPhone})!\n\nCác đơn hàng ngoại lệ chưa có trong bảng giá chuẩn sẽ được tự động gửi tới tài khoản này để báo giá nhanh.\n\nCảm ơn Quý đối tác!`;

        await sendZaloOAReply(userId, reply);
        await recordCrmInteraction(userId, 'bot', reply, {}, 'Xác Nhận Kích Hoạt Nhà Cung Cấp Mặc Định');
        logZaloEvent('token_update', `Đã liên kết Zalo user_id ${userId} cho Nhà cung cấp ${supplierState.defaultSupplierName} (${supplierState.defaultSupplierPhone})`);
        return true;
      }

      // Cú pháp phản hồi báo giá trực tiếp trên Zalo của Ops / Supplier: #baogia <MÃ_ĐƠN> <GIÁ> [ghi chú]
      const baogiaMatch = trimmed.match(/^(?:#baogia|baogia|#bg)\s+([A-Za-z0-9-]+)\s+([^\s]+)(?:\s+(.+))?$/i);
      if (baogiaMatch) {
        if (!supplierEnabled || ![supplierState.dceOpsUserId, supplierState.defaultSupplierUserId].filter(Boolean).includes(userId)) return true;
        const codePart = baogiaMatch[1];
        const pricePart = baogiaMatch[2];
        const notePart = baogiaMatch[3]?.trim();
        const parsedAmount = parseVietnameseMoney(pricePart);
        const quotedByLabel =
          userId === supplierState.defaultSupplierUserId
            ? `${supplierState.defaultSupplierName} (${supplierState.defaultSupplierPhone})`
            : userId === supplierState.dceOpsUserId
            ? `DCE Ops (${supplierState.dceOpsPhone})`
            : `Zalo (${userId.slice(-4)})`;

        const qRes = await applyOrderQuote({
          codeOrSuffix: codePart,
          inputAmountVnd: parsedAmount,
          applyMargin: true,
          quotedBy: quotedByLabel,
          quoteNote: notePart,
        });

        if (qRes.success && qRes.order) {
          const replyText = `✅ Đã ghi nhận báo giá cho đơn ${qRes.order.trackingCode}!\n- Giá gốc nhập: ${formatVnd(qRes.baseCostVnd || 0)}\n- Giá báo Khách (+30%): ${formatVnd(qRes.customerQuoteVnd || 0)}${qRes.customerNotified ? '\n📲 Đã tự động gửi báo giá tới Zalo khách hàng!' : ''}`;
          await sendZaloOAReply(userId, replyText);
        } else {
          await sendZaloOAReply(userId, `❌ Không thể cập nhật báo giá: ${qRes.error || 'Lỗi không xác định'}\nVí dụ đúng: #baogia VN-LOG-1611-8191 450000`);
        }
        return true;
      }

  return false;
}
