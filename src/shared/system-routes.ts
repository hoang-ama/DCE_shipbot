import express, { Request, Response } from 'express';
import path from 'path';
import { Router } from 'express';
import { ROOT_DIR as __dirname } from '../config/paths';
import { adminPasscode } from '../config/env';
import { constantTimeEquals, isAdminAuthorized } from './access-guard';

export const router = Router();

router.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasApiKey: !!process.env.GEMINI_API_KEY,
    model: 'gemini-3.8-flash',
    authRequired: Boolean(adminPasscode),
  });
});

router.get('/api/auth/status', (req: Request, res: Response) => {
  res.json({
    authRequired: Boolean(adminPasscode),
    authorized: isAdminAuthorized(req),
  });
});

router.post('/api/auth/verify', (req: Request, res: Response) => {
  const { passcode } = req.body || {};
  if (!adminPasscode) {
    return res.json({ success: true, authRequired: false });
  }
  const candidate = typeof passcode === 'string' ? passcode.trim() : '';
  if (candidate && constantTimeEquals(candidate, adminPasscode)) {
    return res.json({ success: true, authRequired: true });
  }
  return res.status(401).json({ success: false, error: 'Mật khẩu quản trị không đúng!' });
});

router.get('/api/export-dify-dsl', (_req: Request, res: Response) => {
  const filePath = path.resolve(__dirname, 'dify_dichung_bot.yml');
  res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="dify_dichung_bot.yml"');
  res.sendFile(filePath);
});
