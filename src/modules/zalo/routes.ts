import { liveZalo, tokenMode } from "../../config/env";
import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { Router } from 'express';
import { generateShipmentTextSummary } from '../booking/format';
import { sendZaloOAReply } from './sender';
import { recordCrmInteraction } from '../customer/service';
import { tokenState } from './state';
import { refreshZaloAccessToken, saveTokenCache } from './token-manager';
import { logZaloEvent, zaloLogHistory } from './events';
import { databaseState } from '../../database/connection';
import { supplierState } from '../supplier/state';
import { zaloUserSessions } from '../conversation/state';

export const router = Router();

router.post('/api/zalo/send-order-bill', async (req: Request, res: Response) => {
  const { userId, shippingInfo, trackingCode } = req.body || {};
  if (!userId || !shippingInfo) {
    return res.status(400).json({ error: 'userId and shippingInfo are required' });
  }
  const summaryText = generateShipmentTextSummary(shippingInfo, trackingCode);
  const success = await sendZaloOAReply(userId, summaryText);
  if (success) {
    await recordCrmInteraction(userId, 'bot', summaryText, shippingInfo, 'Phiếu Vận Đơn (ShipBot)');
  }
  return res.json({ success, message: summaryText });
});

export const oauthStateMap = new Map<string, { codeVerifier: string; createdAt: number }>();

export function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url'); // 43 url-safe chars
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function getOAuthRedirectUri(req: Request): string {
  const base = (process.env.APP_URL || 'http://localhost:2700').replace(/\/+$/, '');
  return `${base}/api/zalo/oauth/callback`;
}

router.get('/api/zalo/oauth/login', (req: Request, res: Response) => {
  const appId = process.env.ZALO_APP_ID || '';
  const redirectUri = getOAuthRedirectUri(req);
  const state = crypto.randomBytes(16).toString('hex');
  const { codeVerifier, codeChallenge } = generatePKCE();

  oauthStateMap.set(state, { codeVerifier, createdAt: Date.now() });

  // Clean old entries (> 15 min)
  const now = Date.now();
  for (const [s, val] of oauthStateMap.entries()) {
    if (now - val.createdAt > 15 * 60 * 1000) oauthStateMap.delete(s);
  }

  const zaloAuthUrl = `https://oauth.zalo.me/v4/oa/permission?app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${codeChallenge}&state=${state}`;
  res.redirect(zaloAuthUrl);
});

router.get('/api/zalo/oauth/callback', async (req: Request, res: Response) => {
  const { code, oa_id, state } = req.query;
  const appId = process.env.ZALO_APP_ID || '';
  const secretKey = process.env.ZALO_APP_SECRET || '';

  if (!code || typeof code !== 'string') {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Lỗi Ủy Quyền Zalo</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 40px; background: #f8fafc;">
          <h2 style="color: #ef4444;">Ủy quyền thất bại</h2>
          <p>Không nhận được mã xác thực (code) từ Zalo OAuth.</p>
          <a href="/" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none;">Quay lại ShipBot</a>
        </body>
      </html>
    `);
  }

  let codeVerifier: string | undefined;
  if (state && typeof state === 'string') {
    const cached = oauthStateMap.get(state);
    if (cached) {
      codeVerifier = cached.codeVerifier;
      oauthStateMap.delete(state);
    }
  }

  try {
    const bodyParams = new URLSearchParams({
      code,
      app_id: appId,
      grant_type: 'authorization_code',
    });
    if (codeVerifier) {
      bodyParams.append('code_verifier', codeVerifier);
    }

    const tokenRes = await fetch('https://oauth.zalo.me/v4/oa/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': secretKey,
      },
      body: bodyParams.toString(),
    });

    const tokenData = await tokenRes.json();
    if (tokenData?.access_token) {
      tokenState.currentZaloAccessToken = tokenData.access_token;
      if (tokenData.refresh_token) {
        tokenState.currentZaloRefreshToken = tokenData.refresh_token;
      }
      await saveTokenCache(tokenState.currentZaloAccessToken, tokenState.currentZaloRefreshToken);
      tokenState.lastTokenRefreshTimestamp = Date.now();
      logZaloEvent('token_update', 'Kết nối Zalo OA thành công qua 1-Click OAuth!', { oa_id });

      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Kết Nối Zalo OA Thành Công</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #1e293b;">
            <div style="background: white; padding: 36px 32px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.06); text-align: center; max-width: 440px; border: 1px solid #e2e8f0;">
              <div style="width: 64px; height: 64px; background: #ecfdf5; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 32px;">
                🎉
              </div>
              <h2 style="color: #065f46; margin: 0 0 10px 0; font-size: 22px;">Kết Nối Zalo OA Thành Công!</h2>
              <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
                ShipBot đã tự động lấy và kích hoạt <strong>Access Token</strong> mới, đồng thời lưu trữ vào Database PostgreSQL (shipbot-db). Chỉ tự gia hạn nếu đã bật chế độ local_owner và runtime.zalo.refresh.
              </p>
              <a href="/" style="display: inline-block; background: #2563eb; color: white; padding: 12px 28px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px; box-shadow: 0 4px 12px rgba(37,99,235,0.2);">
                Quay lại ShipBot
              </a>
            </div>
          </body>
        </html>
      `);
    } else {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"><title>Lỗi Lấy Token</title></head>
          <body style="font-family: sans-serif; text-align: center; padding: 40px; background: #f8fafc;">
            <h2 style="color: #ef4444;">Lỗi lấy Token từ Zalo</h2>
            <pre style="background: #f1f5f9; padding: 16px; border-radius: 8px; text-align: left; display: inline-block; font-size: 12px;">${JSON.stringify(tokenData, null, 2)}</pre>
            <br><br>
            <a href="/" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none;">Quay lại ShipBot</a>
          </body>
        </html>
      `);
    }
  } catch (err: any) {
    return res.status(500).send(`Lỗi hệ thống: ${err?.message}`);
  }
});

router.get('/api/zalo/status', async (req: Request, res: Response) => {
  const token = liveZalo ? tokenState.currentZaloAccessToken : '';
  const refreshToken = liveZalo && tokenMode === 'local_owner' ? tokenState.currentZaloRefreshToken : '';
  const appId = process.env.ZALO_APP_ID || '';
  const hasSecret = Boolean(process.env.ZALO_APP_SECRET);

  let tokenValid = false;
  let zaloError: any = null;
  let zaloMessage = '';

  if (!liveZalo) {
    zaloMessage = "Zalo live disabled (development)";
  } else if (!token) {
    zaloMessage = 'Chưa cấu hình ZALO_OA_ACCESS_TOKEN';
  } else {
    try {
      const testRes = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': token,
        },
        body: JSON.stringify({
          recipient: { user_id: 'test_health_check_user' },
          message: { text: 'ping' },
        }),
      });
      const testData = await testRes.json();
      zaloError = testData?.error;
      zaloMessage = testData?.message || '';

      // -213 (User not found) or -201 (Invalid user) means Token IS VALID and accepted by Zalo!
      if (testData?.error === 0 || testData?.error === -213 || testData?.error === -201) {
        tokenValid = true;
        zaloMessage = 'Access Token hợp lệ và đang hoạt động bình thường';
      } else if (testData?.error === -216) {
        tokenValid = false;
        zaloMessage = 'Access Token đã hết hạn (-216: Access token is invalid)';
      } else if (testData?.error === -209) {
        tokenValid = false;
        zaloMessage = 'Ứng dụng chưa được duyệt hoặc thiếu quyền (-209: App has not been approved)';
      } else {
        tokenValid = false;
        zaloMessage = `Zalo trả về: [${testData?.error}] ${testData?.message}`;
      }
    } catch (err: any) {
      zaloMessage = `Không thể kết nối API Zalo: ${err?.message}`;
    }
  }

  const callbackUrl = getOAuthRedirectUri(req);

  res.json({
    connected: tokenValid,
    tokenValid,
    zaloError,
    zaloMessage,
    database: {
      connected: Boolean(databaseState.dbPool),
      type: databaseState.dbPool ? 'PostgreSQL (Vĩnh viễn)' : 'Chưa cấu hình DATABASE_URL (Chỉ lưu RAM)',
    },
    oauth: {
      loginUrl: '/api/zalo/oauth/login',
      callbackUrl,
    },
    config: {
      appId,
      hasAppSecret: hasSecret,
      hasAccessToken: Boolean(token),
      hasRefreshToken: Boolean(refreshToken),
      accessTokenMasked: token ? `${token.slice(0, 6)}...${token.slice(-4)}` : null,
      refreshTokenMasked: refreshToken ? `${refreshToken.slice(0, 6)}...${refreshToken.slice(-4)}` : null,
    },
    ops: {
      phone: supplierState.dceOpsPhone,
      isLinked: Boolean(supplierState.dceOpsUserId),
      userId: supplierState.dceOpsUserId || null,
    },
    routing: {
      opsPhone: supplierState.dceOpsPhone,
      opsUserId: supplierState.dceOpsUserId || null,
      isOpsLinked: Boolean(supplierState.dceOpsUserId),
      supplierName: supplierState.defaultSupplierName,
      supplierPhone: supplierState.defaultSupplierPhone,
      supplierUserId: supplierState.defaultSupplierUserId || null,
      isSupplierLinked: Boolean(supplierState.defaultSupplierUserId),
    },
    stats: {
      activeSessions: zaloUserSessions.size,
      serverTime: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      tokenAgeHours: parseFloat(((Date.now() - tokenState.lastTokenRefreshTimestamp) / (1000 * 60 * 60)).toFixed(1)),
    },
    logs: zaloLogHistory.slice(0, 20),
  });
});

router.post('/api/zalo/update-token', async (req: Request, res: Response) => {
  const { accessToken, refreshToken } = req.body || {};
  if (typeof accessToken !== 'string' || !accessToken.trim() || typeof refreshToken !== 'string' || !refreshToken.trim()) {
    return res.status(400).json({ error: 'Cần cung cấp đồng thời accessToken và refreshToken' });
  }
  try {
    await saveTokenCache(accessToken.trim(), refreshToken.trim());
    logZaloEvent('token_update', 'Đã lưu cặp token mới; chưa kiểm tra quyền gửi tin.');
    return res.json({ success: true, tokenValid: null, message: 'Đã lưu token. Chưa kiểm tra với Zalo.' });
  } catch (error) { return res.status(500).json({ error: 'Không lưu được token' }); }
});

router.post('/api/zalo/refresh-now', async (_req: Request, res: Response) => {
  logZaloEvent('token_refresh', 'Thực hiện yêu cầu thử làm mới token từ Web UI...');
  const newToken = await refreshZaloAccessToken();
  if (newToken) {
    return res.json({
      success: true,
      message: 'Làm mới token thành công!',
      accessTokenMasked: `${newToken.slice(0, 6)}...${newToken.slice(-4)}`,
    });
  } else {
    const lastErr = zaloLogHistory.find((l) => l.type === 'error');
    return res.status(400).json({
      success: false,
      message: 'Làm mới token thất bại. Có thể Refresh Token đã hết hạn (90 ngày) hoặc đã được sử dụng trước đó.',
      details: lastErr?.details || null,
    });
  }
});

router.get('/api/zalo/webhook', (_req: Request, res: Response) => {
  res.status(200).send('ZALO_WEBHOOK_OK');
});
