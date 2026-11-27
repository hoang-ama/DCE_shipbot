import { getLinkedZaloIds, linkZaloIds, wasRecentlySentByBot } from '../zalo/outbound-tracking';
import { zaloUserSessions } from '../conversation/state';
import { inMemoryCustomers } from '../customer/state';
import { databaseState } from '../../database/connection';
import { ensureActiveChatSession, saveSessionsCache } from '../conversation/service';
import { logZaloEvent } from '../zalo/events';
import { recordCrmInteraction } from '../customer/service';

export async function handleOAIntervention(event_name: string, recipient: any, user_id_by_app: any, message: any) {
  linkZaloIds(user_id_by_app, recipient?.id, recipient?.user_id);
  const rawRecipientIds = Array.from(
    new Set(
      [
        recipient?.id,
        recipient?.user_id,
        user_id_by_app,
        ...getLinkedZaloIds(recipient?.id),
        ...getLinkedZaloIds(recipient?.user_id),
        ...getLinkedZaloIds(user_id_by_app),
      ].filter((x): x is string => Boolean(x))
    )
  );
  const recipientId =
    rawRecipientIds.find((id) => zaloUserSessions.has(id) || inMemoryCustomers.has(id)) ||
    user_id_by_app ||
    recipient?.id ||
    recipient?.user_id;
  const oaMsgText = message?.text || `[Nhân viên gửi ${event_name.replace('oa_send_', '')}]`;

  if (rawRecipientIds.length > 0 && !wasRecentlySentByBot(rawRecipientIds, oaMsgText)) {
    // Hỗ trợ lệnh nhanh từ nhân viên trên OA App: "#bot" hoặc "#ai" để bật lại AI
    if (/^#(?:bot|ai)\b/i.test(oaMsgText.trim())) {
      for (const id of rawRecipientIds) {
        const sess = zaloUserSessions.get(id);
        if (sess) {
          sess.humanTakeover = false;
          sess.humanTakeoverBy = undefined;
        }
        const cust = inMemoryCustomers.get(id);
        if (cust) cust.human_takeover = false;
      }
      if (databaseState.dbPool) {
        databaseState.dbPool.query(`UPDATE crm_customers SET human_takeover = FALSE WHERE user_id = ANY($1::text[])`, [rawRecipientIds]).catch(() => {});
      }
      saveSessionsCache();
      logZaloEvent('token_update', `[AI Resumed] Nhân viên đã bật lại Bot AI cho khách ${recipientId}`);
      return;
    }

    // Nhân viên đã nhắn tin trực tiếp -> Mở/lấy phiên 24h & DỪNG AI + HANDOVER hoàn toàn trên mọi ID liên kết
    const { session: oaSession } = ensureActiveChatSession(recipientId || rawRecipientIds[0], {
      forceHumanTakeover: true,
      humanTakeoverBy: 'Tư vấn viên (Zalo OA)',
      linkedIds: rawRecipientIds,
    });
    oaSession.humanTakeover = true;
    oaSession.humanTakeoverBy = 'Tư vấn viên (Zalo OA)';
    oaSession.humanTakeoverAt = Date.now();
    oaSession.idleFollowUpSent = true;
    oaSession.lastActive = Date.now();

    for (const id of rawRecipientIds) {
      const sess = zaloUserSessions.get(id);
      if (sess && sess !== oaSession) {
        sess.humanTakeover = true;
        sess.humanTakeoverBy = 'Tư vấn viên (Zalo OA)';
        sess.humanTakeoverAt = Date.now();
        sess.idleFollowUpSent = true;
        sess.lastActive = Date.now();
        sess.sessionId = oaSession.sessionId;
        sess.sessionStartedAt = oaSession.sessionStartedAt;
      }
      const cust = inMemoryCustomers.get(id);
      if (cust) {
        cust.human_takeover = true;
        cust.current_session_id = oaSession.sessionId;
        if (oaSession.sessionStartedAt) cust.session_started_at = new Date(oaSession.sessionStartedAt).toISOString();
      }
    }
    if (databaseState.dbPool) {
      databaseState.dbPool.query(
        `UPDATE crm_customers SET human_takeover = TRUE, current_session_id = $1 WHERE user_id = ANY($2::text[])`,
        [oaSession.sessionId || null, rawRecipientIds]
      ).catch(() => {});
    }

    if (recipientId) {
      await recordCrmInteraction(recipientId, 'agent', oaMsgText, oaSession?.currentInfo, 'Tư vấn viên (Zalo OA)', oaSession.sessionId);
    }
    saveSessionsCache();
    logZaloEvent('outgoing_reply', `[Human Handover - AI STOP] Nhân viên đã can thiệp trực tiếp cho khách ${recipientId} (Session ${oaSession.sessionId}): "${oaMsgText.slice(0, 60)}"`);
  }
}
