import path from 'path';
import { ROOT_DIR as __dirname } from '../../config/paths';

export const SESSIONS_CACHE_FILE = path.resolve(__dirname, '.zalo_sessions.json');
export const CHAT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface ZaloUserSession {
  sessionId?: string;
  sessionStartedAt?: number;
  history: Array<{ role: 'user' | 'model'; content: string }>;
  currentInfo: any;
  lastActive: number;
  humanTakeover?: boolean;
  humanTakeoverBy?: string;
  humanTakeoverAt?: number;
  lastBotMessageAt?: number;
  lastCustomerMessageAt?: number;
  idleFollowUpSent?: boolean;
}

export const zaloUserSessions = new Map<string, ZaloUserSession>();
