

export interface ZaloLogEntry {
  timestamp: string;
  type: 'incoming_webhook' | 'outgoing_reply' | 'token_refresh' | 'token_update' | 'error';
  summary: string;
  details?: any;
}

export const zaloLogHistory: ZaloLogEntry[] = [];

export function logZaloEvent(type: ZaloLogEntry['type'], summary: string, details?: any) {
  const entry: ZaloLogEntry = {
    timestamp: new Date().toISOString(),
    type,
    summary,
    details,
  };
  zaloLogHistory.unshift(entry);
  if (zaloLogHistory.length > 50) zaloLogHistory.pop();
  console.log(`[Zalo OA Event] [${type}] ${summary}`);
}
