import { allowRefresh, tokenMode, liveZalo } from "../../config/env";
import fs from 'fs';
import { TOKEN_CACHE_FILE, tokenState } from './state';
import { databaseState } from '../../database/connection';
import { logZaloEvent } from './events';

export function loadTokenCache() {
  if (!liveZalo || tokenMode !== "local_owner") return;
try {
  if (fs.existsSync(TOKEN_CACHE_FILE)) {
    const cached = JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, 'utf-8'));
    const age = Date.parse(cached.updated_at || '');
    if (cached.access_token && (!tokenState.currentZaloAccessToken || age > tokenState.lastTokenRefreshTimestamp)) {
      tokenState.currentZaloAccessToken = cached.access_token;
      tokenState.currentZaloRefreshToken = cached.refresh_token || '';
      if (Number.isFinite(age)) tokenState.lastTokenRefreshTimestamp = age;
    }
  }
} catch (e) {
  // ignore cache read error
}
}

export async function saveTokenCache(accessToken: string, refreshToken?: string) {
  if (!liveZalo || tokenMode !== 'local_owner') throw new Error('Not the token owner');
  const now = new Date().toISOString();
  const data = { access_token: accessToken, refresh_token: refreshToken, updated_at: now };
  // Preserve a local recovery copy in case the OAuth refresh succeeds but PostgreSQL fails.
  fs.writeFileSync(TOKEN_CACHE_FILE + '.tmp', JSON.stringify(data), {mode: 0o600});
  fs.renameSync(TOKEN_CACHE_FILE + '.tmp', TOKEN_CACHE_FILE);
  tokenState.currentZaloAccessToken = accessToken;
  tokenState.currentZaloRefreshToken = refreshToken || '';
  tokenState.lastTokenRefreshTimestamp = Date.parse(now);
  if (databaseState.dbPool) {
    await databaseState.dbPool.query(`INSERT INTO zalo_auth (id, access_token, refresh_token, updated_at)
      VALUES ('default', $1, $2, $3) ON CONFLICT (id) DO UPDATE SET access_token=EXCLUDED.access_token, refresh_token=EXCLUDED.refresh_token, updated_at=EXCLUDED.updated_at`, [accessToken, refreshToken || null, now]);
  }
}

let refreshInFlight: Promise<string | null> | undefined;
export async function refreshZaloAccessToken(): Promise<string | null> {
  if (!allowRefresh) return null;
  if (!refreshInFlight) refreshInFlight = performRefresh().finally(() => { refreshInFlight = undefined; });
  return refreshInFlight;
}

async function performRefresh(): Promise<string | null> {
  if (!allowRefresh) return null;
  const appId = process.env.ZALO_APP_ID || '';
  const secretKey = process.env.ZALO_APP_SECRET || '';
  const refreshToken = tokenState.currentZaloRefreshToken || process.env.ZALO_REFRESH_TOKEN || '';

  if (!appId || !secretKey || !refreshToken) {
    const msg = 'Thiếu thông tin xác thực để làm mới token (ZALO_APP_ID, ZALO_APP_SECRET, hoặc ZALO_REFRESH_TOKEN)';
    logZaloEvent('error', msg);
    console.warn(`[Zalo OA] ${msg}`);
    return null;
  }

  try {
    logZaloEvent('token_refresh', 'Đang gửi yêu cầu làm mới Access Token tới Zalo OAuth v4...');
    const bodyParams = new URLSearchParams({
      refresh_token: refreshToken,
      app_id: appId,
      grant_type: 'refresh_token',
    });

    const res = await fetch('https://oauth.zalo.me/v4/oa/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': secretKey,
      },
      body: bodyParams.toString(),
    });

    const data = await res.json();
    if (data?.access_token) {
      tokenState.currentZaloAccessToken = data.access_token;
      if (data.refresh_token) {
        tokenState.currentZaloRefreshToken = data.refresh_token;
      }
      await saveTokenCache(tokenState.currentZaloAccessToken, tokenState.currentZaloRefreshToken);
      logZaloEvent('token_refresh', 'Làm mới Access Token thành công!', {
        expires_in: data.expires_in,
      });
      return tokenState.currentZaloAccessToken;
    } else {
      const errMsg = `Thất bại khi làm mới token: ${data?.error} - ${data?.error_description || data?.message || 'Unknown OAuth error'}`;
      logZaloEvent('error', errMsg);
      console.error('[Zalo OA] Failed to refresh token:', data?.error);
      return null;
    }
  } catch (err: any) {
    const netErr = `Lỗi mạng khi gọi Zalo OAuth: ${err?.message}`;
    logZaloEvent('error', netErr);
    console.error('[Zalo OA] Refresh token network error:', err?.message);
    return null;
  }
}

export function startTokenRefreshJob() {
  if (!allowRefresh) return;
setInterval(async () => {
  const token = tokenState.currentZaloAccessToken || process.env.ZALO_OA_ACCESS_TOKEN || '';
  const refreshToken = tokenState.currentZaloRefreshToken || process.env.ZALO_REFRESH_TOKEN || '';
  if (!token || !refreshToken) return;

  const hoursElapsed = (Date.now() - tokenState.lastTokenRefreshTimestamp) / (1000 * 60 * 60);

  // Auto-refresh proactively every 18 hours (well before 25h expiration limit!)
  if (hoursElapsed >= 18) {
    console.log(`[Zalo OA] Proactive auto-refresh triggered (token age: ${hoursElapsed.toFixed(1)}h)...`);
    logZaloEvent('token_refresh', `Đang tự động gia hạn định kỳ (token age: ${hoursElapsed.toFixed(1)}h)...`);
    const newToken = await refreshZaloAccessToken();
    if (newToken) {
      tokenState.lastTokenRefreshTimestamp = Date.now();
      console.log('[Zalo OA] Proactive token auto-refresh successfully executed!');
    }
  }
}, 30 * 60 * 1000);
}
