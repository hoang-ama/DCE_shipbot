import { Router, Request, Response } from 'express';
import { databaseState } from '../../database/connection';
import { inMemoryCustomers, inMemoryMessages } from './state';
import { zaloUserSessions } from '../conversation/state';
import { sendZaloOAReply } from '../zalo/sender';
import { ensureActiveChatSession, saveSessionsCache } from '../conversation/service';
import { recordCrmInteraction } from './service';
import { logZaloEvent } from '../zalo/events';
import { getLinkedZaloIds } from '../zalo/outbound-tracking';

export const router = Router();

router.get('/api/crm/customers', async (req: Request, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  if (databaseState.dbPool) {
    try {
      let query = `SELECT * FROM crm_customers`;
      const params: any[] = [];
      if (search) {
        query += ` WHERE LOWER(name) LIKE $1 OR phone LIKE $1 OR LOWER(last_message) LIKE $1 OR user_id LIKE $1`;
        params.push(`%${search}%`);
      }
      query += ` ORDER BY last_interaction DESC LIMIT 100`;
      const result = await databaseState.dbPool.query(query, params);
      return res.json(result.rows);
    } catch (e: any) {
      console.error('[CRM API] Error querying customers from DB:', e?.message);
    }
  }

  // Fallback to in-memory customers
  let list = Array.from(inMemoryCustomers.values());
  if (search) {
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(search) ||
        c.phone.includes(search) ||
        c.last_message.toLowerCase().includes(search) ||
        c.user_id.includes(search)
    );
  }
  list.sort((a, b) => new Date(b.last_interaction).getTime() - new Date(a.last_interaction).getTime());
  return res.json(list);
});

router.get('/api/crm/customers/:userId/messages', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';

  if (databaseState.dbPool) {
    try {
      const result = sessionId
        ? await databaseState.dbPool.query(
            `SELECT * FROM crm_messages WHERE user_id = $1 AND session_id = $2 ORDER BY created_at ASC LIMIT 500`,
            [userId, sessionId]
          )
        : await databaseState.dbPool.query(
            `SELECT * FROM crm_messages WHERE user_id = $1 ORDER BY created_at ASC LIMIT 500`,
            [userId]
          );
      return res.json(result.rows);
    } catch (e: any) {
      console.error('[CRM API] Error querying messages from DB:', e?.message);
    }
  }

  // Fallback to in-memory messages
  let list = inMemoryMessages.filter((m) => m.user_id === userId);
  if (sessionId) list = list.filter((m) => m.session_id === sessionId);
  return res.json(list);
});

router.post('/api/crm/customers/:userId/send', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { text, agentName } = req.body || {};

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Nội dung tin nhắn không được để trống' });
  }

  const success = await sendZaloOAReply(userId, text.trim());

  if (success) {
    const { session } = ensureActiveChatSession(userId, {
      forceHumanTakeover: true,
      humanTakeoverBy: agentName || 'Tư vấn viên (Web)',
    });
    session.humanTakeover = true;
    session.humanTakeoverBy = agentName || 'Tư vấn viên (Web)';
    session.humanTakeoverAt = Date.now();
    session.idleFollowUpSent = true;
    session.lastActive = Date.now();
    session.history.push({ role: 'model', content: text.trim() });
    saveSessionsCache();

    const linkedIds = getLinkedZaloIds(userId);
    for (const id of linkedIds) {
      const cust = inMemoryCustomers.get(id);
      if (cust) {
        cust.human_takeover = true;
        cust.current_session_id = session.sessionId;
      }
    }
    if (databaseState.dbPool) {
      databaseState.dbPool.query(
        `UPDATE crm_customers SET human_takeover = TRUE, current_session_id = $1 WHERE user_id = ANY($2::text[])`,
        [session.sessionId || null, linkedIds]
      ).catch(() => {});
    }

    await recordCrmInteraction(
      userId,
      'agent',
      text.trim(),
      session?.currentInfo,
      agentName || 'Tư vấn viên (Web)',
      session.sessionId
    );

    return res.json({ success: true, humanTakeover: true, sessionId: session.sessionId, message: 'Đã gửi tin nhắn và tạm dừng AI để tư vấn viên tiếp quản!' });
  } else {
    return res.status(500).json({ success: false, error: 'Không thể gửi tin nhắn qua Zalo OA. Kiểm tra Access Token!' });
  }
});

router.post('/api/crm/customers/:userId/ai-toggle', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { humanTakeover } = req.body || {};
  const paused = Boolean(humanTakeover);

  const { session } = ensureActiveChatSession(userId);
  session.humanTakeover = paused;
  session.humanTakeoverAt = paused ? Date.now() : undefined;
  saveSessionsCache();

  const linkedIds = getLinkedZaloIds(userId);
  for (const id of linkedIds) {
    const cust = inMemoryCustomers.get(id);
    if (cust) cust.human_takeover = paused;
  }
  if (databaseState.dbPool) {
    databaseState.dbPool.query(`UPDATE crm_customers SET human_takeover = $1 WHERE user_id = ANY($2::text[])`, [paused, linkedIds]).catch(() => {});
  }

  logZaloEvent('token_update', `[CRM] ${paused ? 'Đã tạm dừng AI (Handover)' : 'Đã bật lại Bot AI'} cho khách ${userId} (Session ${session.sessionId})`);
  return res.json({ success: true, userId, sessionId: session.sessionId, humanTakeover: paused });
});

router.put('/api/crm/customers/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { name, phone, address } = req.body || {};

  const customer = inMemoryCustomers.get(userId);
  if (customer) {
    if (name) customer.name = name;
    if (phone) customer.phone = phone;
    if (address) customer.address = address;
  }

  if (databaseState.dbPool) {
    try {
      await databaseState.dbPool.query(
        `UPDATE crm_customers SET name = COALESCE($1, name), phone = COALESCE($2, phone), address = COALESCE($3, address) WHERE user_id = $4`,
        [name || null, phone || null, address || null, userId]
      );
    } catch (e: any) {
      console.error('[CRM API] Error updating customer:', e?.message);
    }
  }

  return res.json({ success: true, customer });
});
