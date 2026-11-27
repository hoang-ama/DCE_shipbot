import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { liveZalo, tokenMode, databaseEnabled, adminPasscode } from '../config/env';
import { runtime } from '../config/runtime';

export function constantTimeEquals(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export function validateConfiguration() {
  if (!['disabled', 'access_only', 'local_owner'].includes(tokenMode)) {
    throw new Error('Unknown runtime.zalo.tokenMode');
  }
  if (liveZalo && (tokenMode === 'disabled' || !process.env.ZALO_APP_ID)) {
    console.warn('[Config] ZALO_APP_ID missing while liveZalo=true; OAuth/refresh disabled until configured.');
  }
  if (databaseEnabled) {
    const url = new URL(process.env.DATABASE_URL || '');
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      throw new Error('Invalid DATABASE_URL');
    }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !runtime.database.allowRemote) {
      throw new Error('Remote DB disabled; use dedicated local development DB');
    }
  }
}

export function extractAdminPasscodeFromRequest(req: Request): string {
  const headerPass = req.get('x-admin-passcode') || req.get('x-admin-key') || '';
  if (headerPass) return headerPass.trim();
  const auth = req.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const queryPass = typeof req.query.passcode === 'string' ? req.query.passcode : '';
  return queryPass.trim();
}

export function isAdminAuthorized(req: Request): boolean {
  if (!adminPasscode) return true;
  const supplied = extractAdminPasscodeFromRequest(req);
  if (!supplied) return false;
  return constantTimeEquals(supplied, adminPasscode);
}

function requiresAdminAuth(pathNormalized: string): boolean {
  if (
    pathNormalized.startsWith('/api/crm') ||
    pathNormalized.startsWith('/api/config') ||
    pathNormalized.startsWith('/api/ops') ||
    pathNormalized.startsWith('/api/db') ||
    pathNormalized.startsWith('/api/dispatch') ||
    pathNormalized.startsWith('/api/pricing/routes') ||
    pathNormalized === '/api/asterisk/calls' ||
    pathNormalized === '/api/zalo/status' ||
    pathNormalized === '/api/zalo/update-token' ||
    pathNormalized === '/api/zalo/refresh-now' ||
    pathNormalized === '/api/zalo/send-order-bill' ||
    pathNormalized.startsWith('/api/zalo/oauth')
  ) {
    return true;
  }

  // /api/orders/* EXCEPT public 1-click portals (/quote, /payment) and notify-ops? Note notify-ops is admin/internal too
  if (pathNormalized === '/api/orders' || pathNormalized.startsWith('/api/orders/')) {
    if (/^\/api\/orders\/[^/]+\/(?:quote|payment)$/.test(pathNormalized)) {
      return false;
    }
    return true;
  }

  return false;
}

export function accessGuard(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const p = req.path.toLowerCase().replace(/\/+$/, '') || '/';

  if (
    /^\/api\/zalo\/(oauth\/|refresh-now|update-token)/.test(p) &&
    (!liveZalo || tokenMode !== 'local_owner')
  ) {
    return res.status(403).json({
      error: 'Token owner actions disabled',
    });
  }

  if (adminPasscode && requiresAdminAuth(p) && !isAdminAuthorized(req)) {
    return res.status(401).json({
      error: 'ADMIN_AUTH_REQUIRED',
      message: 'Cần xác thực mật khẩu quản trị (ADMIN_PASSCODE) để truy cập mục này.',
    });
  }

  next();
}
