import { runtime } from '../src/config/runtime';

// Test-only isolation. Does not change .env or application settings on disk.
process.env.GEMINI_API_KEY = '';
process.env.DATABASE_URL = '';
process.env.ZALO_OA_ACCESS_TOKEN = '';
process.env.ZALO_REFRESH_TOKEN = '';
runtime.zalo.live = false;
runtime.zalo.tokenMode = 'disabled';
runtime.zalo.refresh = false;
runtime.zalo.idleFollowUp = false;
runtime.supplier.enabled = false;
