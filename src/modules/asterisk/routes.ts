import express, { Request, Response } from 'express';
import { Router } from 'express';
import { ASTERISK_WEBHOOK_SECRET, AsteriskCallLog, asteriskState, inMemoryCallLogs } from './state';
import { normalizeVietnamPhone, recentAsteriskCallTimestamps, sendZaloZnsGreeting } from './service';
import { inMemoryCustomers } from '../customer/state';
import { databaseState } from '../../database/connection';
import { zaloUserSessions } from '../conversation/state';
import { ensureActiveChatSession, saveSessionsCache } from '../conversation/service';
import { sendZaloOAReply } from '../zalo/sender';
import { recordCrmInteraction } from '../customer/service';
import { supplierState } from '../supplier/state';
import { logZaloEvent } from '../zalo/events';

export const router = Router();

router.post('/api/asterisk/incoming-call', async (req: Request, res: Response) => {
  try {
    if (ASTERISK_WEBHOOK_SECRET) {
      const secret = req.headers['x-api-key'] || req.headers['authorization'] || req.query.secret;
      if (String(secret || '').replace(/^Bearer\s+/i, '') !== ASTERISK_WEBHOOK_SECRET) {
        return res.status(401).json({ success: false, error: 'Invalid Asterisk webhook secret' });
      }
    }

    const body = req.body || {};
    const rawPhone = String(body.callerPhone || body.caller_id || body.callerId || body.phone || body.from || '').trim();
    const uniqueId = String(body.uniqueId || body.unique_id || body.callId || `ast-${Date.now()}`).trim();

    if (!rawPhone) {
      return res.status(400).json({ success: false, error: 'callerPhone / caller_id is required' });
    }

    const { local0, intl84, tail9 } = normalizeVietnamPhone(rawPhone);
    const nowMs = Date.now();
    const lastCallMs = recentAsteriskCallTimestamps.get(local0) || 0;

    // Chống spam trùng lặp nếu khách gọi nhiều lần trong vòng 5 phút
    if (nowMs - lastCallMs < 5 * 60 * 1000) {
      const dedupLog: AsteriskCallLog = {
        id: `call-${nowMs}`,
        callerPhone: rawPhone,
        normalizedPhone: local0,
        uniqueId,
        channelUsed: 'deduplicated',
        status: 'ignored_duplicate_5m',
        createdAt: new Date().toLocaleString('vi-VN'),
      };
      inMemoryCallLogs.unshift(dedupLog);
      return res.json({ success: true, deduplicated: true, call: dedupLog });
    }
    recentAsteriskCallTimestamps.set(local0, nowMs);

    // Tìm xem SĐT này đã từng tương tác Zalo OA chưa
    let matchedUserId: string | undefined;
    for (const [uid, cust] of inMemoryCustomers.entries()) {
      if (cust.phone && cust.phone.replace(/\D/g, '').endsWith(tail9)) {
        matchedUserId = uid;
        break;
      }
    }
    if (!matchedUserId && databaseState.dbPool && tail9.length >= 9) {
      try {
        const q = await databaseState.dbPool.query(
          `SELECT user_id FROM crm_customers WHERE phone LIKE $1 ORDER BY last_interaction DESC LIMIT 1`,
          [`%${tail9}%`]
        );
        if (q.rows.length > 0) matchedUserId = q.rows[0].user_id;
      } catch (_) {}
    }

    let channelUsed: AsteriskCallLog['channelUsed'] = 'pending_zns';
    let status = 'pending_zns';

    if (matchedUserId) {
      // Khách đã từng tương tác OA -> Mở Session mới (nếu chưa có hoặc >24h) với subVertical = express & gửi tin chào từ Bot
      const greetingText = `Chào anh/chị! Đi Chung Express vừa nhận được cuộc gọi từ số ${local0} tới tổng đài.\n\nBên em chuyên về dịch vụ vận chuyển hỏa tốc, giao nhận tận nơi. Anh/chị vui lòng gửi em xin thông tin địa chỉ lấy hàng, địa chỉ giao hàng và thông tin hàng hóa để bên em tính cước báo giá nhanh nhất nhé ạ!`;

      const sessionInfo = {
        mainVertical: 'chuyen_hang',
        subVertical: 'express',
        sender: { phone: local0 },
      };
      const { session: callSession } = ensureActiveChatSession(matchedUserId, { initialInfo: sessionInfo });
      if (!callSession.humanTakeover) {
        callSession.currentInfo = {
          ...(callSession.currentInfo || {}),
          mainVertical: 'chuyen_hang',
          subVertical: 'express',
          sender: { ...(callSession.currentInfo?.sender || {}), phone: local0 },
        };
        callSession.history.push({ role: 'model', content: greetingText });
        callSession.lastActive = nowMs;
        callSession.lastBotMessageAt = nowMs;
        saveSessionsCache();

        const sent = await sendZaloOAReply(matchedUserId, greetingText);
        if (sent) {
          channelUsed = 'zalo_oa_cs';
          status = 'sent_greeting_oa';
          await recordCrmInteraction(matchedUserId, 'bot', greetingText, callSession.currentInfo, 'Chào Từ Tổng Đài Asterisk', callSession.sessionId);
        } else {
          status = 'oa_send_failed';
        }
      } else {
        channelUsed = 'zalo_oa_cs';
        status = 'skipped_human_takeover_active';
      }
    } else if (asteriskState.zaloZnsTemplateId) {
      // Khách mới hoàn toàn -> Gửi ZNS Template chào hỏi có nút CTA Nhắn tin ngay
      const znsRes = await sendZaloZnsGreeting(intl84, uniqueId);
      if (znsRes.success) {
        channelUsed = 'zalo_zns';
        status = 'sent_zns_template';
      } else {
        channelUsed = 'pending_zns';
        status = `zns_error: ${znsRes.error || 'unknown'}`;
      }
    } else {
      // Chưa có ZNS Template -> Nhắc DCE Ops chủ động liên hệ qua Zalo
      if (supplierState.dceOpsUserId) {
        sendZaloOAReply(
          supplierState.dceOpsUserId,
          `📞 [CUỘC GỌI TỔNG ĐÀI ASTERISK MỚI]\n- SĐT khách gọi: ${local0}\n- Khách chưa từng nhắn Zalo OA & chưa cấu hình ZNS Template.\n👉 Bấm mở Zalo khách ngay: https://zalo.me/${local0}`
        ).catch(() => {});
      }
    }

    const callLog: AsteriskCallLog = {
      id: `call-${nowMs}`,
      callerPhone: rawPhone,
      normalizedPhone: local0,
      uniqueId,
      zaloUserId: matchedUserId,
      channelUsed,
      status,
      createdAt: new Date().toLocaleString('vi-VN'),
    };
    inMemoryCallLogs.unshift(callLog);
    if (inMemoryCallLogs.length > 50) inMemoryCallLogs.length = 50;

    if (databaseState.dbPool) {
      databaseState.dbPool.query(
        `INSERT INTO asterisk_call_logs (id, caller_phone, normalized_phone, unique_id, zalo_user_id, channel_used, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [callLog.id, callLog.callerPhone, callLog.normalizedPhone, callLog.uniqueId || null, callLog.zaloUserId || null, callLog.channelUsed, callLog.status]
      ).catch(() => {});
    }

    logZaloEvent('incoming_webhook', `Cuộc gọi Asterisk từ ${local0} -> ${channelUsed} (${status})`, callLog);

    return res.json({ success: true, call: callLog });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

router.get('/api/asterisk/calls', async (_req: Request, res: Response) => {
  return res.json({ success: true, calls: inMemoryCallLogs });
});

router.get('/api/config/asterisk', (req: Request, res: Response) => {
  const host = req.get('host') || 'localhost:2700';
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  return res.json({
    webhookUrl: `${proto}://${host}/api/asterisk/incoming-call`,
    zaloZnsTemplateId: asteriskState.zaloZnsTemplateId,
    hasWebhookSecret: Boolean(ASTERISK_WEBHOOK_SECRET),
  });
});

router.post('/api/config/asterisk', async (req: Request, res: Response) => {
  const { zaloZnsTemplateId: tplId } = req.body || {};
  if (typeof tplId === 'string') {
    asteriskState.zaloZnsTemplateId = tplId.trim();
    if (databaseState.dbPool) {
      await databaseState.dbPool.query(
        `INSERT INTO bot_settings (key, value, updated_at) VALUES ('zalo_zns_template_id', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
        [asteriskState.zaloZnsTemplateId]
      ).catch(() => {});
    }
  }
  return res.json({
    success: true,
    zaloZnsTemplateId: asteriskState.zaloZnsTemplateId,
    message: 'Đã lưu cấu hình Tổng đài Asterisk & Zalo ZNS Template ID!',
  });
});
