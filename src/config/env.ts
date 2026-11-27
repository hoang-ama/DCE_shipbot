import dotenv from 'dotenv';
import { ROOT_DIR } from './paths';
import path from 'node:path';
import { runtime } from './runtime';
dotenv.config({ path: path.join(ROOT_DIR, '.env') });

export const liveZalo = runtime.zalo.live;
export const tokenMode = runtime.zalo.tokenMode;
export const allowRefresh = liveZalo && tokenMode === 'local_owner' && runtime.zalo.refresh;
export const port = Number(process.env.PORT || 2700);
export const host = (process.env.HOST || runtime.host || '0.0.0.0').trim();
export const databaseEnabled = Boolean(process.env.DATABASE_URL?.trim());
export const supplierEnabled = runtime.supplier.enabled;
export const adminPasscode = (process.env.ADMIN_PASSCODE || process.env.ADMIN_API_KEY || '').trim();
