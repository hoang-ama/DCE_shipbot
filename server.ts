import { GROUP_MENU } from './src/shared/service-menu';
// Application entry point and cross-module orchestration.
import './src/config/env';
import { runtime } from './src/config/runtime';
import express from 'express';
import path from 'node:path';
import { port, host, liveZalo, allowRefresh, tokenMode, databaseEnabled } from './src/config/env';
import { ROOT_DIR } from './src/config/paths';
import { initPool, databaseState } from './src/database/connection';
import { initDatabaseAndRestore } from './src/database/bootstrap';
import { loadTokenCache, startTokenRefreshJob } from './src/modules/zalo/token-manager';
import { loadSessionsCache, startSessionCleanup } from './src/modules/conversation/service';
import { router as playgroundRouter } from './src/chatbot/playground/routes';
import { router as sandboxRouter } from './src/chatbot/workflows/routes';
import { router as zaloRouter } from './src/modules/zalo/routes';
import { router as customerRouter } from './src/modules/customer/routes';
import { router as bookingRouter } from './src/modules/booking/routes';
import { router as pricingRouter } from './src/modules/pricing/routes';
import { router as supplierRouter } from './src/modules/supplier/routes';
import { router as paymentRouter } from './src/modules/payment/routes';
import { router as asteriskRouter } from './src/modules/asterisk/routes';
import { router as dbRouter } from './src/database/routes';
import { router as systemRouter } from './src/shared/system-routes';
import { accessGuard, validateConfiguration } from './src/shared/access-guard';
import { Request, Response } from 'express';
import { calculateDCExpressPriceFromShippingInfo, formatVnd } from './src/modules/pricing/engine';
import { Router } from 'express';
import { processChatPipeline } from './src/chatbot/engine';
import { pricingState } from './src/modules/pricing/state';
import { inMemoryOrders } from './src/modules/booking/state';
import { completeOrderPaymentAndDispatch } from './src/modules/payment/dispatch';
import { paymentState } from './src/modules/payment/state';
import { supplierState } from './src/modules/supplier/state';
import { sendZaloOAReply } from './src/modules/zalo/sender';
import { getLinkedZaloIds, linkZaloIds } from './src/modules/zalo/outbound-tracking';
import { handleOAIntervention } from './src/modules/handover/service';
import { handleSupplierCommand } from './src/modules/supplier/commands';
import { zaloUserSessions } from './src/modules/conversation/state';
import { inMemoryCustomers } from './src/modules/customer/state';
import {
  ensureActiveChatSession,
  isSessionExpired24h,
  saveSessionsCache,
} from './src/modules/conversation/service';
import {
  handleCustomerZaloWorkflow,
  handlePartnerZaloMessage,
} from './src/orchestrator/coordinator';
import { createDispatchRouter } from './src/orchestrator/routes';
import { logZaloEvent } from './src/modules/zalo/events';
import { recordCrmInteraction } from './src/modules/customer/service';
import { isValidVNPhone } from './src/chatbot/extraction/express';
import { errorDetail } from './src/chatbot/chains/trace';
import { randomUUID } from 'node:crypto';

// Web chat
const chatRouter = Router();

chatRouter.post('/api/chat', async (req: Request, res: Response) => {
  const { message: rawMessage, history = [], currentInfo = {} } = req.body;

  if (!rawMessage || typeof rawMessage !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  const suppliedId = req.get('X-Chat-Request-Id');
  const requestId = suppliedId && /^[a-zA-Z0-9_-]{1,80}$/.test(suppliedId) ? suppliedId : randomUUID();
  res.setHeader('X-Chat-Request-Id', requestId);
  console.info(`[CHAT HTTP] id=${requestId} started`);
  const started = Date.now();
  // Full prompt/output trace is only enabled for same-origin loopback Web Chat.
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '');
  const origin = req.get('origin');
  const expectedOrigins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`];
  const expectedHosts = expectedOrigins.map(value => new URL(value).host);
  const sameOrigin = origin ? expectedOrigins.includes(origin) : req.get('sec-fetch-site') === 'same-origin';
  const debug = loopback && expectedHosts.includes(req.get('host') || '') && sameOrigin && req.get('sec-fetch-site') !== 'cross-site';
  res.on('close', () => { if (!res.writableFinished) console.warn(`[CHAT HTTP] id=${requestId} client_closed elapsed_ms=${Date.now()-started}`); });
  try {
    const result = await processChatPipeline(rawMessage, history, currentInfo, { debug });
    const pricing = result.shippingInfo.subVertical === "express" ? calculateDCExpressPriceFromShippingInfo(result.shippingInfo, pricingState.activeStandardRoutes) : null;
    console.info(`[CHAT HTTP] id=${requestId} completed elapsed_ms=${Date.now()-started} closed=${res.destroyed}`);
    if (!res.destroyed && !res.writableEnded) return res.json({ ...result, pricing });
  } catch (error) {
    const detail = errorDetail(error);
    console.error(`[CHAT HTTP] id=${requestId} failed`, detail);
    if (!res.destroyed && !res.headersSent) return res.status(500).json({error:'CHAT_PROCESSING_ERROR',aiTrace:{source:'error',reason:'CHAT_PROCESSING_ERROR',elapsedMs:Date.now()-started,steps:[{node:'web_request',status:'error',reason:'CHAT_PROCESSING_ERROR',...(debug?{detail:{requestId,error:detail}}:{})}]}});
  }
});

// Order closing and payment orchestration
export async function handleCustomerClosingWorkflow(userId: string, userText: string): Promise<string | null> {
  const t = userText.trim().toLowerCase();
  const activeOrder = inMemoryOrders.find(
    (o) =>
      (o.zaloUserId === userId || o.id.includes(userId)) &&
      ['created', 'quoting', 'quoted', 'confirmed'].includes(o.status)
  );
  if (!activeOrder || !activeOrder.estimatedPrice || activeOrder.estimatedPrice <= 0) {
    return null;
  }

  const publicBaseUrl = (process.env.APP_URL || 'http://localhost:2700').replace(/\/+$/, '');
  const payUrl = `${publicBaseUrl}/pay/${encodeURIComponent(activeOrder.trackingCode)}`;

  // 1. Khách chọn thanh toán COD / Tiền mặt
  if (activeOrder.status === 'confirmed' && /^(?:cod|tiền\s*mặt|tien\s*mat|thu\s*hộ|trả\s*sau)/i.test(t)) {
    const res = await completeOrderPaymentAndDispatch({ codeOrSuffix: activeOrder.trackingCode, method: 'cod' });
    if (res.success && res.dispatchText) {
      return `Dạ em đã ghi nhận hình thức thanh toán **COD (Tiền mặt)** cho đơn ${activeOrder.trackingCode} rồi ạ!\n\n${res.dispatchText}`;
    }
  }

  // 2. Khách chọn chuyển khoản VietQR
  if (activeOrder.status === 'confirmed' && /(?:chuyển\s*khoản|vietqr|qr|ck|trả\s*trước)/i.test(t)) {
    return `Dạ anh/chị vui lòng quét mã QR hoặc chuyển khoản theo thông tin dưới đây để hoàn tất đơn **${activeOrder.trackingCode}** ạ:\n\n🏦 Ngân hàng: ${paymentState.paymentBankId}\n💳 Số tài khoản: ${paymentState.paymentAccountNo}\n👤 Chủ tài khoản: ${paymentState.paymentAccountName}\n💰 Số tiền: ${formatVnd(activeOrder.estimatedPrice)}\n📝 Nội dung CK: ${activeOrder.trackingCode}\n\n🔗 Bấm vào đây để mở mã QR thanh toán nhanh: ${payUrl}\n\n*(Hoặc nhắn **COD** nếu anh/chị muốn thanh toán tiền mặt khi lấy/nhận hàng ạ)*`;
  }

  // 3. Khách đồng ý / Chốt đơn (khi đơn đang ở trạng thái quoted hoặc created có giá)
  if (/^(?:đồng\s*ý|chốt\s*đơn|ok\s*chốt|chốt\s*nhé|ok\s*em|lên\s*đơn\s*đi|xác\s*nhận\s*đơn)/i.test(t) && activeOrder.status !== 'confirmed') {
    activeOrder.status = 'confirmed';
    if (databaseState.dbPool) {
      databaseState.dbPool.query(`UPDATE shipping_orders SET status = 'confirmed' WHERE tracking_code = $1`, [activeOrder.trackingCode]).catch(() => {});
    }
    return `🎉 Dạ em đã chốt đơn **${activeOrder.trackingCode}** với giá trọn gói **${formatVnd(activeOrder.estimatedPrice)}** rồi ạ!\n\nAnh/chị vui lòng chọn hình thức thanh toán:\n1️⃣ **Chuyển khoản VietQR**: Mở link QR thanh toán nhanh tại ${payUrl}\n2️⃣ **Thanh toán COD / Tiền mặt**: Nhắn chữ **COD** để bên em lên lệnh điều tài xế qua lấy hàng ngay ạ!`;
  }

  // 4. Khách chê đắt / Thương lượng giá -> Áp dụng CTKM giảm 10% lần 1, lần 2 chuyển CSKH
  if (/(?:đắt|mắc|giá\s*cao|giảm\s*giá|bớt\s*(?:đi|chút|không)|thương\s*lượng|ưu\s*đãi)/i.test(t)) {
    if (!activeOrder.negotiationUsed) {
      const discountedPrice = Math.round((activeOrder.estimatedPrice * 0.9) / 1000) * 1000;
      activeOrder.estimatedPrice = discountedPrice;
      activeOrder.negotiationUsed = true;
      if (databaseState.dbPool) {
        databaseState.dbPool.query(
          `UPDATE shipping_orders SET customer_quote_vnd = $1, negotiation_used = TRUE WHERE tracking_code = $2`,
          [discountedPrice, activeOrder.trackingCode]
        ).catch(() => {});
      }
      return `Dạ bên em rất mong được phục vụ chuyến hàng này cho anh/chị. Em xin phép áp dụng **Ưu đãi giảm trực tiếp 10%** cho đơn **${activeOrder.trackingCode}**, giá trọn gói chỉ còn **${formatVnd(discountedPrice)}** ạ.\n\nAnh/chị nhắn **"Đồng ý"** hoặc **"Chốt đơn"** để em lên lệnh lấy hàng ngay cho mình nhé!`;
    } else {
      if (supplierState.dceOpsUserId) {
        sendZaloOAReply(
          supplierState.dceOpsUserId,
          `⚠️ [CẦN CSKH CAN THIỆP] Khách hàng đơn ${activeOrder.trackingCode} (${activeOrder.customerName || userId}) vẫn đang thương lượng thêm sau khi đã giảm 10% (${formatVnd(activeOrder.estimatedPrice)}). Vui lòng hỗ trợ trực tiếp!`
        ).catch(() => {});
      }
      return `Dạ đơn hàng **${activeOrder.trackingCode}** của mình có tính chất đặc thù, em đã chuyển thông tin tới chuyên viên điều phối (${supplierState.dceOpsPhone}) để hỗ trợ mức giá tốt nhất cho anh/chị ngay đây ạ!`;
    }
  }

  return null;
}

// Zalo events and idle follow-up
const messageRouter = Router();

messageRouter.post('/api/zalo/webhook', async (req: Request, res: Response) => {
  const { event_name, user_id_by_app, sender, recipient, message } = req.body || {};
  const userId = String(user_id_by_app || sender?.id || '').trim();
  const userText = message?.text;
  const replyToMsgId = message?.reply_to?.msg_id ? String(message.reply_to.msg_id) : undefined;

  linkZaloIds(user_id_by_app, sender?.id, recipient?.id);
  const allLinkedIds = getLinkedZaloIds(userId);

  // Acknowledge Zalo immediately to prevent retries (timeout is 3s on Zalo)
  res.status(200).json({ error: 0, message: 'Received' });

  // 1. BẮT SỰ KIỆN NHÂN VIÊN CAN THIỆP TRỰC TIẾP TRÊN ZALO OA APP (oa_send_text, oa_send_image, oa_send_file...)
  if (typeof event_name === 'string' && event_name.startsWith('oa_send_')) {
    await handleOAIntervention(event_name, recipient, user_id_by_app, message);
    return;
  }

  if (event_name === 'user_send_text' && userId && userText) {
    logZaloEvent('incoming_webhook', `Khách hàng ${userId} nhắn: "${userText}"`, {
      event_name,
      userId,
      userText,
      msgId: message?.msg_id,
      replyToMsgId,
    });
    console.log(`[Zalo OA] Incoming message from user ${userId}: ${userText}`);
    try {
      const trimmed = userText.trim();
      if (await handleSupplierCommand(userId, trimmed)) return;

      // 2. ĐỐI TÁC ĐIỀU PHỐI (DCE OPS CẤP 1 HOẶC CSĐT CẤP 2) PHẢN HỒI BÁO GIÁ / HỎI LẠI / TỪ CHỐI / SĐT TÀI XẾ
      const partnerResult = await handlePartnerZaloMessage({
        userIds: allLinkedIds,
        primaryUserId: userId,
        messageText: trimmed,
        replyToMsgId,
      });
      if (partnerResult.handled) {
        return;
      }

      // 3. PHIÊN CHAT CỐ ĐỊNH 24H CHO KHÁCH HÀNG ZALO OA (mặc định vào thẳng express)
      const isResetOrder = /^(?:tạo\s*đơn\s*mới|đơn\s*mới|hủy\s*đơn|làm\s*lại|reset)\b/i.test(trimmed);
      const { session } = ensureActiveChatSession(userId, {
        linkedIds: allLinkedIds,
        initialInfo: { mainVertical: 'chuyen_hang', subVertical: 'express' },
      });

      if (isResetOrder && !session.humanTakeover) {
        session.history = [];
        session.currentInfo = { mainVertical: 'chuyen_hang', subVertical: 'express' };
      }

      session.lastActive = Date.now();
      session.lastCustomerMessageAt = Date.now();
      session.idleFollowUpSent = false;

      // Record incoming customer message in CRM (gắn chặt với sessionId 24h)
      await recordCrmInteraction(userId, 'user', userText, session.currentInfo, undefined, session.sessionId);

      // QUY TẮC HANDOVER 24H: Nếu nhân viên đã chat trong phiên 24h này -> AI DỪNG HOÀN TOÀN
      const anyTakeover = session.humanTakeover || allLinkedIds.some((id) => inMemoryCustomers.get(id)?.human_takeover);
      if (anyTakeover) {
        session.humanTakeover = true;
        saveSessionsCache();
        console.log(`[Human Handover] AI đã dừng cho khách ${userId} (phiên ${session.sessionId}), bỏ qua trả lời tự động.`);
        return;
      }

      // 4. LUỒNG MULTI-AGENT ORCHESTRATOR CHO ĐƠN ĐANG ĐIỀU PHỐI / ĐÃ BÁO GIÁ / THU THẬP SĐT & THANH TOÁN + VIETQR
      const orchestratorResult = await handleCustomerZaloWorkflow({
        userIds: allLinkedIds,
        primaryUserId: userId,
        chatSessionId: session.sessionId,
        messageText: trimmed,
      });
      if (orchestratorResult.handled) {
        session.history.push({ role: 'user', content: userText });
        if (orchestratorResult.customerMessage) {
          session.history.push({ role: 'model', content: orchestratorResult.customerMessage });
          session.lastBotMessageAt = Date.now();
          await sendZaloOAReply(userId, orchestratorResult.customerMessage);
          await recordCrmInteraction(
            userId,
            'bot',
            orchestratorResult.customerMessage,
            orchestratorResult.order?.shippingInfo || session.currentInfo,
            'ShipBot AI CSKH',
            session.sessionId
          );
        }
        saveSessionsCache();
        return;
      }

      // 5. Fallback chốt đơn / COD cho đơn chuẩn cũ nếu chưa qua orchestrator state
      const closingReply =
        session.currentInfo?.subVertical === 'express' ||
        (!session.currentInfo?.mainVertical && (session.currentInfo?.sender?.address || session.currentInfo?.isConfirmed))
          ? await handleCustomerClosingWorkflow(userId, userText)
          : null;
      if (closingReply) {
        session.history.push({ role: 'user', content: userText });
        session.history.push({ role: 'model', content: closingReply });
        session.lastActive = Date.now();
        session.lastBotMessageAt = Date.now();
        saveSessionsCache();
        await sendZaloOAReply(userId, closingReply);
        await recordCrmInteraction(userId, 'bot', closingReply, session.currentInfo, 'ShipBot AI CSKH', session.sessionId);
        return;
      }

      // 6. Tiếp nhận thông tin đơn mới trên Zalo OA (mặc định đi thẳng Express, không bật GROUP_MENU)
      const result = await processChatPipeline(userText, session.history, session.currentInfo, {
        channel: 'zalo',
      });

      session.history.push({ role: 'user', content: userText });
      session.history.push({ role: 'model', content: result.reply });
      session.currentInfo = result.shippingInfo;
      session.lastActive = Date.now();
      session.lastBotMessageAt = Date.now();

      saveSessionsCache();
      await sendZaloOAReply(userId, result.reply);
      await recordCrmInteraction(userId, 'bot', result.reply, result.shippingInfo, 'ShipBot AI', session.sessionId);
    } catch (err: any) {
      logZaloEvent('error', `Lỗi xử lý tin nhắn của user ${userId}: ${err?.message}`);
      console.error('[Zalo OA] Error processing chat reply:', err?.message);
    }
  }
});

export function startIdleFollowUp() {
setInterval(async () => {
  const now = Date.now();
  const IDLE_MS = 5 * 60 * 1000;
  const MAX_AGE_MS = 30 * 60 * 1000;

  for (const [uid, sess] of zaloUserSessions.entries()) {
    if (uid === supplierState.dceOpsUserId || uid === supplierState.defaultSupplierUserId) continue;
    if (sess.humanTakeover || sess.idleFollowUpSent || sess.currentInfo?.isComplete) continue;
    if (isSessionExpired24h(sess, now)) continue;
    if (!sess.history || sess.history.length === 0) continue;

    const lastMsg = sess.history[sess.history.length - 1];
    if (lastMsg.role !== 'model') continue;

    const refTime = sess.lastBotMessageAt || sess.lastActive;
    const elapsed = now - refTime;
    if (elapsed >= IDLE_MS && elapsed <= MAX_AGE_MS) {
      sess.idleFollowUpSent = true;
      const cust = inMemoryCustomers.get(uid);
      const knownPhone = sess.currentInfo?.sender?.phone || cust?.phone || '';
      const followUpText = isValidVNPhone(knownPhone)
        ? `Anh/chị ơi, khi nào tiện anh/chị nhắn thêm thông tin giúp em nhé, hoặc bên em sẽ liên hệ qua số ${knownPhone} để tư vấn trực tiếp cho mình ạ!`
        : 'Anh/chị ơi, nếu mình đang bận chưa tiện nhắn tin, anh/chị cho em xin số điện thoại để bên em liên hệ lại tư vấn và báo giá trực tiếp nhé!';

      sess.history.push({ role: 'model', content: followUpText });
      sess.lastBotMessageAt = now;
      saveSessionsCache();

      const sent = await sendZaloOAReply(uid, followUpText);
      if (sent) {
        await recordCrmInteraction(uid, 'bot', followUpText, sess.currentInfo, 'ShipBot (Nhắc sau 5 phút)');
        logZaloEvent('outgoing_reply', `Đã gửi tin nhắn xin SĐT sau 5 phút không phản hồi tới ${uid}`);
      }
    }
  }
}, 30 * 1000);
}

// Startup and shutdown


























async function main() {
  validateConfiguration();
  if (databaseEnabled) {
    await initPool();
    await initDatabaseAndRestore();
  }
  loadTokenCache();
  loadSessionsCache();
  const app = express();
  app.disable('x-powered-by');
  app.set('case sensitive routing', true);
  // Public access is disabled by default. Authentication before all routes in live mode.
  app.use(accessGuard);
  app.use(express.json({ limit: '25mb' }));
  for (const router of [systemRouter, chatRouter, playgroundRouter, sandboxRouter,
    zaloRouter, messageRouter, customerRouter, bookingRouter, pricingRouter,
    supplierRouter, paymentRouter, asteriskRouter, dbRouter]) app.use(router);
  app.use('/api/dispatch', createDispatchRouter());
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Unknown API endpoint' }); });
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({ root: ROOT_DIR, server: { middlewareMode: true }, appType: 'mpa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(ROOT_DIR, 'dist')));
    app.get(['/', '/index.html'], (_req, res) => {
      res.sendFile(path.join(ROOT_DIR, 'dist', 'index.html'));
    });
    app.get(['/playground', '/playground.html'], (_req, res) => {
      res.sendFile(path.join(ROOT_DIR, 'dist', 'playground.html'));
    });
    app.get(['/dichung', '/dichung.html'], (_req, res) => {
      res.sendFile(path.join(ROOT_DIR, 'dist', 'dichung.html'));
    });
  }
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Server]', err?.message || 'Unknown error');
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  });
  startSessionCleanup();
  if (allowRefresh) startTokenRefreshJob();
  if (liveZalo && runtime.zalo.idleFollowUp) startIdleFollowUp();
  const server = app.listen(port, host, () => {
    console.log(`[dev_bot] http://${host}:${port} | Zalo live=${liveZalo} | token=${tokenMode} | DB=${Boolean(databaseState.dbPool)}`);
    console.log('[dev_bot] /playground.html: original three-party simulator; /dichung.html: ride sandbox');
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
    server.close(() => { void databaseState.dbPool?.end().finally(() => process.exit(0)); if (!databaseState.dbPool) process.exit(0); });
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
main().catch(async error => { console.error('[Startup failed]', error?.message); await databaseState.dbPool?.end(); process.exit(1); });
