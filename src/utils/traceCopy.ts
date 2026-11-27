import type { ChatMessage } from '../types';

export const MAX_COPIED_TURNS = 10;
export interface TraceTurn { index: number; user: ChatMessage; reply: ChatMessage }

export function completedTraceTurns(messages: ChatMessage[]): TraceTurn[] {
  const replies = new Map<string, ChatMessage>();
  for (const message of messages) if (message.sender === 'bot' && message.replyToId) replies.set(message.replyToId, message);
  return messages.filter(message => message.sender === 'user').flatMap((user, index) => {
    const reply = replies.get(user.id);
    return reply ? [{ index: index + 1, user, reply }] : [];
  });
}

export function formatTraceTurn({ index, user, reply }: TraceTurn): string {
  return [`========== LƯỢT ${index} ==========`, JSON.stringify({
    turn: index,
    user: { id: user.id, timestamp: user.timestamp, text: user.text },
    bot: { id: reply.id, timestamp: reply.timestamp, text: reply.text, quickReplies: reply.quickReplies ?? [] },
    aiTrace: reply.aiTrace ?? null,
    ...(reply.aiTrace ? {} : { note: 'Backend không trả trace cho lượt này.' }),
  }, null, 2)].join('\n');
}

export function formatRecentTraceTurns(turns: TraceTurn[]): string {
  return turns.slice(-MAX_COPIED_TURNS).map(formatTraceTurn).join('\n\n');
}

export async function copyTraceText(text: string, container: HTMLElement): Promise<void> {
  if (!text) throw new Error('Không có dữ liệu để sao chép.');
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; } } catch { /* use legacy clipboard below */ }
  const previousFocus = document.activeElement;
  const field = document.createElement('textarea');
  field.value = text; field.readOnly = true;
  field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
  container.appendChild(field);
  try {
    field.focus({ preventScroll: true }); field.select(); field.setSelectionRange(0, field.value.length);
    if (!document.execCommand('copy')) throw new Error('Trình duyệt từ chối quyền sao chép.');
  } finally {
    field.remove();
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
  }
}
