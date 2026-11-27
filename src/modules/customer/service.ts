import { CrmMessage, inMemoryCustomers, inMemoryMessages } from './state';
import { fetchZaloUserProfile } from '../zalo/profile';
import { databaseState } from '../../database/connection';
import { inMemoryOrders } from '../booking/state';
import { saveShippingOrder } from '../booking/service';
import { generateTrackingCode } from '../../chatbot/extraction/express';
import { zaloUserSessions } from '../conversation/state';
import { generateChatSessionId } from '../conversation/service';

export async function recordCrmInteraction(
  userId: string,
  sender: 'user' | 'bot' | 'agent',
  messageText: string,
  shippingInfo?: any,
  senderName?: string,
  sessionId?: string
) {
  const now = new Date().toISOString();
  const sess = zaloUserSessions.get(userId);
  const existingCust = inMemoryCustomers.get(userId);
  const activeSessionId = sessionId || sess?.sessionId || existingCust?.current_session_id || generateChatSessionId();
  const sessionStartedIso = sess?.sessionStartedAt
    ? new Date(sess.sessionStartedAt).toISOString()
    : existingCust?.session_started_at || now;

  // Try extracting name, phone, address from shippingInfo if present
  const detectedName = shippingInfo?.sender?.name || shippingInfo?.receiver?.name || '';
  const detectedPhone = shippingInfo?.sender?.phone || shippingInfo?.receiver?.phone || '';
  const detectedAddress = shippingInfo?.sender?.address || shippingInfo?.pickup?.address || shippingInfo?.receiver?.address || '';

  // Get or initialize customer
  let customer = existingCust;
  if (!customer) {
    customer = {
      user_id: userId,
      name: detectedName || `Khách Zalo (${userId.slice(-4)})`,
      phone: detectedPhone || '',
      address: detectedAddress || '',
      avatar: '',
      order_count: shippingInfo?.isComplete || shippingInfo?.isConfirmed ? 1 : 0,
      first_interaction: now,
      last_interaction: now,
      last_message: messageText,
      human_takeover: Boolean(sess?.humanTakeover || sender === 'agent'),
      current_session_id: activeSessionId,
      session_started_at: sessionStartedIso,
      shipping_info: shippingInfo || {},
    };
    inMemoryCustomers.set(userId, customer);

    // Try fetching Zalo profile in background
    fetchZaloUserProfile(userId).then((profile) => {
      if (profile && customer) {
        if (profile.display_name) customer.name = profile.display_name;
        if (profile.avatar) customer.avatar = profile.avatar;
        if (profile.phone && !customer.phone) customer.phone = profile.phone;
        if (databaseState.dbPool) {
          databaseState.dbPool.query(
            `UPDATE crm_customers SET name = $1, avatar = $2, phone = COALESCE(NULLIF(phone, ''), $3) WHERE user_id = $4`,
            [customer.name, customer.avatar, customer.phone, userId]
          ).catch(() => { });
        }
      }
    });
  } else {
    customer.last_interaction = now;
    customer.last_message = messageText;
    customer.current_session_id = activeSessionId;
    customer.session_started_at = sessionStartedIso;
    if (sender === 'agent') {
      customer.human_takeover = true;
    }
    if (detectedName && (customer.name.startsWith('Khách Zalo') || !customer.name)) {
      customer.name = detectedName;
    }
    if (detectedPhone && !customer.phone) {
      customer.phone = detectedPhone;
    }
    if (detectedAddress && !customer.address) {
      customer.address = detectedAddress;
    }
    if (shippingInfo) {
      customer.shipping_info = shippingInfo;
      if ((!shippingInfo.subVertical || shippingInfo.subVertical === "express") && (shippingInfo.isComplete || shippingInfo.isConfirmed)) {
        customer.order_count = (customer.order_count || 0) + 1;
        // Auto-save confirmed order from Zalo OA into PostgreSQL shipbot-db (scoped per 24h chat session)
        const alreadySavedInSession = inMemoryOrders.some(
          (o) => (activeSessionId && o.chatSessionId === activeSessionId) || (!o.chatSessionId && o.id.includes(userId))
        );
        if (!alreadySavedInSession) {
          saveShippingOrder({
            id: `zalo-ord-${userId}-${Date.now()}`,
            trackingCode: shippingInfo?.trackingCode || generateTrackingCode(),
            customerName: customer.name,
            customerPhone: customer.phone,
            zaloUserId: userId,
            chatSessionId: activeSessionId,
            source: 'zalo',
            shippingInfo,
          }).catch(() => { });
        }
      }
    }
  }

  // Record Message
  const resolvedSenderName = senderName || (sender === 'user' ? customer.name : sender === 'agent' ? 'Tư vấn viên' : 'ShipBot AI');
  const msgEntry: CrmMessage = {
    id: Date.now() + Math.random(),
    user_id: userId,
    session_id: activeSessionId,
    sender,
    sender_name: resolvedSenderName,
    message_text: messageText,
    shipping_info_snapshot: shippingInfo || null,
    created_at: now,
  };
  inMemoryMessages.push(msgEntry);
  if (inMemoryMessages.length > 2000) inMemoryMessages.shift();

  // Persist to PostgreSQL if connected
  if (databaseState.dbPool) {
    try {
      await databaseState.dbPool.query(`
        INSERT INTO crm_customers (user_id, name, phone, address, avatar, order_count, first_interaction, last_interaction, last_message, human_takeover, current_session_id, session_started_at, shipping_info)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (user_id) DO UPDATE
        SET name = COALESCE(NULLIF(EXCLUDED.name, ''), crm_customers.name),
            phone = COALESCE(NULLIF(EXCLUDED.phone, ''), crm_customers.phone),
            address = COALESCE(NULLIF(EXCLUDED.address, ''), crm_customers.address),
            avatar = COALESCE(NULLIF(EXCLUDED.avatar, ''), crm_customers.avatar),
            order_count = crm_customers.order_count + (CASE WHEN ($13::jsonb->>'isConfirmed')::boolean = true THEN 1 ELSE 0 END),
            last_interaction = EXCLUDED.last_interaction,
            last_message = EXCLUDED.last_message,
            human_takeover = COALESCE(EXCLUDED.human_takeover, crm_customers.human_takeover),
            current_session_id = EXCLUDED.current_session_id,
            session_started_at = EXCLUDED.session_started_at,
            shipping_info = EXCLUDED.shipping_info;
      `, [
        customer.user_id,
        customer.name,
        customer.phone,
        customer.address,
        customer.avatar,
        customer.order_count,
        customer.first_interaction,
        customer.last_interaction,
        customer.last_message,
        Boolean(customer.human_takeover),
        activeSessionId,
        sessionStartedIso,
        JSON.stringify(customer.shipping_info || {}),
      ]);

      await databaseState.dbPool.query(`
        INSERT INTO crm_messages (user_id, session_id, sender, sender_name, message_text, shipping_info_snapshot, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7);
      `, [
        userId,
        activeSessionId,
        sender,
        resolvedSenderName,
        messageText,
        shippingInfo ? JSON.stringify(shippingInfo) : null,
        now,
      ]);
    } catch (dbErr: any) {
      console.error('[CRM Database] Error saving CRM record:', dbErr?.message);
    }
  }
}
