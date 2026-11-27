import { liveZalo } from "../../config/env";
import { tokenState } from './state';
import { logZaloEvent } from './events';
import { markBotSentMessage } from './outbound-tracking';
import { refreshZaloAccessToken } from './token-manager';

export async function sendZaloOAReplyWithMeta(
  userId: string,
  replyText: string
): Promise<{ success: boolean; messageId?: string }> {
  if (!liveZalo) { console.info("[Zalo DRY RUN] outbound skipped"); return { success: false }; }
  const token = tokenState.currentZaloAccessToken || process.env.ZALO_OA_ACCESS_TOKEN || '';
  if (!token) {
    const msg = 'ZALO_OA_ACCESS_TOKEN bị trống, không thể gửi tin nhắn';
    logZaloEvent('error', msg);
    console.warn(`[Zalo OA] ${msg}`);
    return { success: false };
  }

  async function callZaloApi(authToken: string) {
    markBotSentMessage(userId, replyText);
    return await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': authToken,
      },
      body: JSON.stringify({
        recipient: { user_id: userId },
        message: { text: replyText },
      }),
    });
  }

  try {
    let res = await callZaloApi(token);
    let data = await res.json();
    console.log('[Zalo OA] Send response:', data);

    // If token expired (error code -216 or token expired message), attempt auto-refresh and retry once
    if (data?.error === -216 || data?.error === -204 || data?.error === -205 || (typeof data?.message === 'string' && data.message.toLowerCase().includes('token'))) {
      logZaloEvent('token_refresh', 'Access Token hết hạn (-216), hệ thống đang thử tự động làm mới...');
      const newToken = await refreshZaloAccessToken();
      if (newToken) {
        res = await callZaloApi(newToken);
        data = await res.json();
        console.log('[Zalo OA] Retry response after refresh:', data);
      }
    }

    if (data?.error === 0) {
      const messageId = data?.data?.message_id ? String(data.data.message_id) : undefined;
      logZaloEvent('outgoing_reply', `Đã gửi trả lời tới user ${userId}`, {
        text: replyText.slice(0, 120),
        zaloMsgId: messageId,
      });
      return { success: true, messageId };
    } else {
      logZaloEvent('error', `Lỗi khi gửi tin tới Zalo: Mã ${data?.error} - ${data?.message}`, data);
      return { success: false };
    }
  } catch (err: any) {
    logZaloEvent('error', `Ngoại lệ khi gửi tin Zalo: ${err?.message}`);
    console.error('[Zalo OA] Error sending message:', err);
    return { success: false };
  }
}

export async function sendZaloOAReply(userId: string, replyText: string): Promise<boolean> {
  const result = await sendZaloOAReplyWithMeta(userId, replyText);
  return result.success;
}
