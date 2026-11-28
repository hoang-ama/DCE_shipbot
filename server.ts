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
import { passengerTransportRouter } from './chatbot/passenger-transport/routes';
import { cargoTransportRouter } from './chatbot/cargo-transport/routes';
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
const CHAT_JOB_TIMEOUT_MS = 60_000;
const CHAT_JOB_TTL_MS = 10 * 60_000;
type ChatJob = {
  id: string;
  requestId: string;
  createdAt: number;
  status: 'running' | 'done' | 'error';
  result?: any;
  error?: string;
  aiTrace?: any;
};
const chatJobs = new Map<string, ChatJob>();
const chatRequestJobs = new Map<string, string>();

/**
 * Zalo acknowledges webhooks immediately, then keeps processing on the server.
 * If Qwen is temporarily unavailable, retry the pipeline for one total minute
 * before sending the final fallback to the customer.
 */
async function processZaloChatWithQwenWait(
  requestId: string,
  rawMessage: string,
  history: any[],
  currentInfo: any,
  debug: boolean,
) {
  const started = Date.now();
  const deadlineAt = started + CHAT_JOB_TIMEOUT_MS;
  const retrySteps: any[] = [];
  let attempt = 0;
  let lastResult: any;

  while (Date.now() < deadlineAt) {
    attempt += 1;
    lastResult = await processChatPipeline(rawMessage, history, currentInfo, { debug, channel: 'zalo', qwenDeadlineAt: deadlineAt });
    const qwenError = lastResult.aiTrace?.steps?.some(
      (step: any) => /qwen/iu.test(String(step.node || '')) && step.status === 'error',
    );

    if (!qwenError) {
      if (attempt > 1 && lastResult.aiTrace) {
        lastResult.aiTrace.steps = [...retrySteps, ...lastResult.aiTrace.steps];
        lastResult.aiTrace.elapsedMs = Date.now() - started;
      }
      console.info(`[Zalo AI] request_id=${requestId} completed attempts=${attempt} elapsed_ms=${Date.now() - started}`);
      return lastResult;
    }

    retrySteps.push({
      node: 'zalo_qwen_wait',
      status: 'info',
      reason: 'QWEN_ATTEMPT_FAILED_RETRYING',
      detail: { attempt, elapsedMs: Date.now() - started },
    });
    const remaining = deadlineAt - Date.now();
    console.warn(`[Zalo AI] request_id=${requestId} Qwen attempt failed; retrying`, { attempt, remaining_ms: remaining });
    if (remaining <= 250) break;
    const retryDelay = Math.min(5000, 500 * (2 ** Math.min(attempt - 1, 4)), remaining);
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }

  if (lastResult) {
    const elapsedMs = Date.now() - started;
    lastResult.aiTrace = {
      ...(lastResult.aiTrace || {}),
      source: 'error',
      reason: 'QWEN_WAIT_TIMEOUT',
      elapsedMs,
      steps: [
        ...retrySteps,
        ...(lastResult.aiTrace?.steps || []),
        { node: 'zalo_qwen_wait', status: 'error', reason: 'ONE_MINUTE_DEADLINE', detail: { requestId, attempt, timeoutMs: CHAT_JOB_TIMEOUT_MS } },
      ],
    };
    console.error(`[Zalo AI] request_id=${requestId} Qwen wait timed out`, { attempt, elapsed_ms: elapsedMs });
    return lastResult;
  }

  throw new Error(`ZALO_CHAT_PIPELINE_FAILED:${requestId}`);
}

function pruneChatJobs() {
  const cutoff = Date.now() - CHAT_JOB_TTL_MS;
  for (const [id, job] of chatJobs) if (job.createdAt < cutoff) chatJobs.delete(id);
  for (const [requestId, jobId] of chatRequestJobs) if (!chatJobs.has(jobId)) chatRequestJobs.delete(requestId);
}

function startChatJob(job: ChatJob, rawMessage: string, history: any[], currentInfo: any, debug: boolean) {
  const started = Date.now();
  const timer = setTimeout(() => {
    if (job.status !== 'running') return;
    job.status = 'error';
    job.error = 'CHAT_JOB_TIMEOUT';
    job.aiTrace = { source: 'error', reason: 'CHAT_JOB_TIMEOUT', elapsedMs: Date.now() - started, steps: [{ node: 'chat_job', status: 'error', reason: 'ONE_MINUTE_DEADLINE', detail: { requestId: job.requestId, timeoutMs: CHAT_JOB_TIMEOUT_MS } }] };
    console.error(`[CHAT JOB] id=${job.id} timed out elapsed_ms=${Date.now() - started}`);
  }, CHAT_JOB_TIMEOUT_MS);
  timer.unref?.();

  void (async () => {
    let attempt = 0;
    while (job.status === 'running') {
      attempt += 1;
      const result = await processChatPipeline(rawMessage, history, currentInfo, {
        debug,
        qwenDeadlineAt: started + CHAT_JOB_TIMEOUT_MS,
      });
      if (job.status !== 'running') return;
      const qwenFailed = result.aiTrace?.steps?.some((step: any) => /qwen/iu.test(String(step.node || '')) && step.status === 'error');
      if (qwenFailed) {
        console.warn(`[CHAT JOB] id=${job.id} Qwen attempt failed; keeping result private and retrying`, { attempt, elapsed_ms: Date.now() - started });
        if (Date.now() - started + 250 >= CHAT_JOB_TIMEOUT_MS) return;
        await new Promise(resolve => setTimeout(resolve, 250));
        continue;
      }
      const pricing = result.shippingInfo.subVertical === 'express'
        ? calculateDCExpressPriceFromShippingInfo(result.shippingInfo, pricingState.activeStandardRoutes)
        : null;
      job.result = { ...result, pricing };
      job.status = 'done';
      console.info(`[CHAT JOB] id=${job.id} completed attempts=${attempt} elapsed_ms=${Date.now() - started}`);
      return;
    }
  })()
    .catch((error) => {
      if (job.status !== 'running') return;
      const detail = errorDetail(error);
      job.status = 'error';
      job.error = 'CHAT_PROCESSING_ERROR';
      job.aiTrace = { source: 'error', reason: 'CHAT_PROCESSING_ERROR', elapsedMs: Date.now() - started, steps: [{ node: 'chat_job', status: 'error', reason: 'CHAT_PROCESSING_ERROR', detail: { requestId: job.requestId, error: detail } }] };
      console.error(`[CHAT JOB] id=${job.id} failed`, detail);
    })
    .finally(() => clearTimeout(timer));
}

// Async endpoint: the browser gets a job ID immediately and polls for its result.
// Server-side work continues if the browser closes a polling request.
function enqueueChatJob(req: Request, res: Response) {
  const { message: rawMessage, history = [], currentInfo = {} } = req.body || {};
  if (!rawMessage || typeof rawMessage !== 'string') return res.status(400).json({ error: 'Message is required' });

  pruneChatJobs();
  const suppliedId = req.get('X-Chat-Request-Id');
  const requestId = suppliedId && /^[a-zA-Z0-9_-]{1,80}$/.test(suppliedId) ? suppliedId : randomUUID();
  const existingId = chatRequestJobs.get(requestId);
  const existing = existingId ? chatJobs.get(existingId) : undefined;
  if (existing) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(202).json({ jobId: existing.id, status: existing.status });
  }

  const job: ChatJob = { id: randomUUID(), requestId, createdAt: Date.now(), status: 'running' };
  chatJobs.set(job.id, job);
  chatRequestJobs.set(requestId, job.id);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Chat-Request-Id', requestId);

  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '');
  const origin = req.get('origin');
  const expectedOrigins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`];
  const expectedHosts = expectedOrigins.map(value => new URL(value).host);
  const sameOrigin = origin ? expectedOrigins.includes(origin) : req.get('sec-fetch-site') === 'same-origin';
  const debug = loopback && expectedHosts.includes(req.get('host') || '') && sameOrigin && req.get('sec-fetch-site') !== 'cross-site';
  console.info(`[CHAT JOB] id=${job.id} request_id=${requestId} started deadline_ms=${CHAT_JOB_TIMEOUT_MS}`);
  startChatJob(job, rawMessage, Array.isArray(history) ? history : [], currentInfo, debug);
  return res.status(202).json({ jobId: job.id, status: 'running', timeoutMs: CHAT_JOB_TIMEOUT_MS });
}

chatRouter.post('/api/chat', enqueueChatJob);
chatRouter.post('/api/chat/jobs', enqueueChatJob);
chatRouter.post('/api/chat', enqueueChatJob);

chatRouter.get('/api/chat/jobs/:jobId', (req: Request, res: Response) => {
  pruneChatJobs();
  const job = chatJobs.get(req.params.jobId);
  res.setHeader('Cache-Control', 'no-store');
  if (!job) return res.status(404).json({ status: 'error', error: 'CHAT_JOB_NOT_FOUND' });
  if (job.status === 'running') return res.status(202).json({ jobId: job.id, status: 'running', elapsedMs: Date.now() - job.createdAt });
  if (job.status === 'error') return res.status(job.error === 'CHAT_JOB_TIMEOUT' ? 504 : 500).json({ jobId: job.id, status: 'error', error: job.error, aiTrace: job.aiTrace });
  return res.json({ jobId: job.id, status: 'done', result: job.result });
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
const processedInboundZaloMessages = new Map<string, number>();
const INBOUND_ZALO_DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PROCESSED_ZALO_MESSAGES = 20_000;

function isDuplicateInboundZaloMessage(userId: string, rawMessageId: unknown): boolean {
  const messageId = String(rawMessageId ?? '').trim();
  if (!messageId) return false;

  const now = Date.now();
  for (const [key, expiresAt] of processedInboundZaloMessages) {
    if (expiresAt > now) break;
    processedInboundZaloMessages.delete(key);
  }

  const key = `${userId}:${messageId}`;
  if (processedInboundZaloMessages.has(key)) return true;
  if (processedInboundZaloMessages.size >= MAX_PROCESSED_ZALO_MESSAGES) {
    const oldestKey = processedInboundZaloMessages.keys().next().value;
    if (oldestKey) processedInboundZaloMessages.delete(oldestKey);
  }
  processedInboundZaloMessages.set(key, now + INBOUND_ZALO_DEDUPE_TTL_MS);
  return false;
}

const messageRouter = Router();

messageRouter.post('/api/zalo/webhook', async (req: Request, res: Response) => {
  const { event_name, user_id_by_app, sender, recipient, message } = req.body || {};
  const userId = String(user_id_by_app || sender?.id || '').trim();
  const userText = message?.text;
  const replyToMsgId = message?.reply_to?.msg_id ? String(message.reply_to.msg_id) : undefined;

  // Acknowledge Zalo immediately to prevent retries (timeout is 3s on Zalo)
  res.status(200).json({ error: 0, message: 'Received' });

  // OA intervention events address a customer, so their recipient IDs are safe aliases for that customer.
  if (typeof event_name === 'string' && event_name.startsWith('oa_send_')) {
    await handleOAIntervention(event_name, recipient, user_id_by_app, message);
    return;
  }

  if (event_name === 'user_send_text' && userId && userText) {
    if (isDuplicateInboundZaloMessage(userId, message?.msg_id)) {
      console.info(`[Zalo OA] Ignored duplicate inbound message ${String(message?.msg_id)}`);
      return;
    }

    // For an inbound customer message, recipient.id is the shared OA identity, not another ID for the customer.
    // Linking it would make every customer appear aliased to a linked Ops/supplier account.
    linkZaloIds(user_id_by_app, sender?.id);
    const allLinkedIds = getLinkedZaloIds(userId);
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

      // 3. PHIÊN CHAT CỐ ĐỊNH 24H CHO KHÁCH HÀNG ZALO OA; khách chọn nhóm rồi chọn nhánh con
      const isResetOrder = /^(?:tạo\s*đơn\s*mới|đơn\s*mới|hủy\s*đơn|làm\s*lại|reset)\b/i.test(trimmed);
      const { session } = ensureActiveChatSession(userId, {
        linkedIds: allLinkedIds,
        initialInfo: {},
      });

      if (isResetOrder && !session.humanTakeover) {
        session.history = [];
        session.currentInfo = {};
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

      // 6. Tiếp nhận thông tin đơn mới trên Zalo OA; chọn nhóm và nhánh dịch vụ trước khi thu thập hồ sơ
      const result = await processZaloChatWithQwenWait(
        String(message?.msg_id || randomUUID()),
        userText,
        session.history,
        session.currentInfo,
        true, // CRM's internal AI trace viewer needs sanitized node payloads.
      );

      if (result.suppressed) {
        session.history.push({ role: 'user', content: userText });
        session.currentInfo = result.shippingInfo;
        session.lastActive = Date.now();
        saveSessionsCache();
        console.info(`[Zalo OA] Automatic reply suppressed for ${userId}: quote is awaiting manual handling`);
        return;
      }

      session.history.push({ role: 'user', content: userText });
      session.history.push({ role: 'model', content: result.reply });
      session.currentInfo = result.shippingInfo;
      session.lastActive = Date.now();
      session.lastBotMessageAt = Date.now();

      saveSessionsCache();
      await sendZaloOAReply(userId, result.reply);
      await recordCrmInteraction(userId, 'bot', result.reply, result.shippingInfo, 'ShipBot AI', session.sessionId, result.aiTrace);
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
    supplierRouter, paymentRouter, asteriskRouter, dbRouter, passengerTransportRouter, cargoTransportRouter]) app.use(router);
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
