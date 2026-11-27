import { trimSessionHistory } from '../../chatbot/memory';
import fs from 'fs';
import { CHAT_SESSION_TTL_MS, SESSIONS_CACHE_FILE, ZaloUserSession, zaloUserSessions } from './state';
import { databaseState } from '../../database/connection';
import { getLinkedZaloIds } from '../zalo/outbound-tracking';
import { inMemoryCustomers } from '../customer/state';
import { logZaloEvent } from '../zalo/events';

export function generateChatSessionId(): string {
  const date = new Date();
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CHAT-${d}${m}-${rand}`;
}

export function isSessionExpired24h(sess?: ZaloUserSession | null, now = Date.now()): boolean {
  if (!sess) return true;
  const startTs = sess.sessionStartedAt || sess.lastActive || 0;
  if (!startTs) return true;
  return now - startTs >= CHAT_SESSION_TTL_MS;
}

export function ensureActiveChatSession(
  userId: string,
  options?: {
    forceHumanTakeover?: boolean;
    humanTakeoverBy?: string;
    initialInfo?: any;
    linkedIds?: string[];
  }
): { session: ZaloUserSession; isNewSession: boolean } {
  const now = Date.now();
  const allIds = Array.from(new Set([userId, ...(options?.linkedIds || []), ...getLinkedZaloIds(userId)].filter(Boolean)));

  let existing: ZaloUserSession | undefined = zaloUserSessions.get(userId);
  if (!existing) {
    for (const id of allIds) {
      const candidate = zaloUserSessions.get(id);
      if (candidate) {
        existing = candidate;
        break;
      }
    }
  }

  // Fallback khôi phục session còn hạn < 24h từ CRM nếu server vừa khởi động lại
  if (!existing) {
    for (const id of allIds) {
      const cust = inMemoryCustomers.get(id);
      if (cust?.current_session_id && cust?.session_started_at) {
        const startedMs = new Date(cust.session_started_at).getTime();
        if (!Number.isNaN(startedMs) && now - startedMs < CHAT_SESSION_TTL_MS) {
          existing = {
            sessionId: cust.current_session_id,
            sessionStartedAt: startedMs,
            history: [],
            currentInfo: cust.shipping_info || {},
            lastActive: cust.last_interaction ? new Date(cust.last_interaction).getTime() : startedMs,
            humanTakeover: Boolean(cust.human_takeover),
          };
          zaloUserSessions.set(userId, existing);
          break;
        }
      }
    }
  }

  if (existing && !isSessionExpired24h(existing, now)) {
    if (!existing.sessionId) existing.sessionId = generateChatSessionId();
    if (!existing.sessionStartedAt) existing.sessionStartedAt = existing.lastActive || now;
    if (!zaloUserSessions.has(userId)) {
      zaloUserSessions.set(userId, existing);
    }
    return { session: existing, isNewSession: false };
  }

  // Hết 24h cố định hoặc chưa từng có session -> mở phiên mới hoàn toàn
  const newSessionId = generateChatSessionId();
  const fresh: ZaloUserSession = {
    sessionId: newSessionId,
    sessionStartedAt: now,
    history: [],
    currentInfo: options?.initialInfo ? JSON.parse(JSON.stringify(options.initialInfo)) : {},
    lastActive: now,
    humanTakeover: Boolean(options?.forceHumanTakeover),
    humanTakeoverBy: options?.forceHumanTakeover ? options.humanTakeoverBy : undefined,
    humanTakeoverAt: options?.forceHumanTakeover ? now : undefined,
    idleFollowUpSent: Boolean(options?.forceHumanTakeover),
  };
  zaloUserSessions.set(userId, fresh);

  for (const id of allIds) {
    if (id !== userId && zaloUserSessions.has(id)) {
      zaloUserSessions.delete(id);
    }
    const cust = inMemoryCustomers.get(id);
    if (cust) {
      cust.human_takeover = Boolean(options?.forceHumanTakeover);
      cust.current_session_id = newSessionId;
      cust.session_started_at = new Date(now).toISOString();
      cust.shipping_info = fresh.currentInfo;
    }
  }

  if (databaseState.dbPool && allIds.length > 0) {
    databaseState.dbPool
      .query(
        `UPDATE crm_customers
         SET human_takeover = $1,
             current_session_id = $2,
             session_started_at = $3
         WHERE user_id = ANY($4::text[])`,
        [Boolean(options?.forceHumanTakeover), newSessionId, new Date(now).toISOString(), allIds]
      )
      .catch(() => {});
  }

  logZaloEvent('token_update', `[Chat Session] Mở phiên mới ${newSessionId} cho khách ${userId} (24h cố định)`);
  return { session: fresh, isNewSession: true };
}

export function loadSessionsCache() {
  try {
    if (fs.existsSync(SESSIONS_CACHE_FILE)) {
      const obj = JSON.parse(fs.readFileSync(SESSIONS_CACHE_FILE, 'utf-8'));
      const now = Date.now();
      for (const [k, v] of Object.entries(obj)) {
        const sess = v as ZaloUserSession;
        if (!zaloUserSessions.has(k) && !isSessionExpired24h(sess, now)) {
          zaloUserSessions.set(k, sess);
        }
      }
      console.log(`[Zalo OA] Loaded ${zaloUserSessions.size} active sessions from disk.`);
    }
  } catch (e) {
    // ignore
  }
}

export function saveSessionsCache() {
  for (const session of zaloUserSessions.values()) {
    session.history = trimSessionHistory(session.history || []);
  }
  try {
    const obj: Record<string, any> = {};
    for (const [k, v] of zaloUserSessions.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(SESSIONS_CACHE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    // ignore
  }

  // Persist to PostgreSQL
  if (databaseState.dbPool) {
    for (const [uid, sess] of zaloUserSessions.entries()) {
      databaseState.dbPool.query(`
        INSERT INTO zalo_sessions (user_id, session_data, last_active)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET session_data = EXCLUDED.session_data, last_active = NOW();
      `, [uid, JSON.stringify(sess)]).catch(() => { });
    }
  }
}

export function startSessionCleanup() {
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [uid, sess] of zaloUserSessions.entries()) {
      if (isSessionExpired24h(sess, now)) {
        zaloUserSessions.delete(uid);
        const cust = inMemoryCustomers.get(uid);
        if (cust) cust.human_takeover = false;
        changed = true;
      }
    }
    if (changed) saveSessionsCache();
  }, 60 * 60 * 1000);
}
