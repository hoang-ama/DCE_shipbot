import { runtime } from "../../config/runtime";


export const asteriskState = {
  zaloZnsTemplateId: runtime.asterisk.znsTemplateId as string,
};

export const ASTERISK_WEBHOOK_SECRET: string = runtime.asterisk.webhookSecret;

export interface AsteriskCallLog {
  id: string;
  callerPhone: string;
  normalizedPhone: string;
  uniqueId?: string;
  zaloUserId?: string;
  channelUsed: 'zalo_oa_cs' | 'zalo_zns' | 'pending_zns' | 'deduplicated';
  status: string;
  createdAt: string;
}

export const inMemoryCallLogs: AsteriskCallLog[] = [];
