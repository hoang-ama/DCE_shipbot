import { Router } from 'express';
import * as service from './service';
export const router = Router();
router.post('/api/chatbot/customer', async (req, res, next) => {
  try { const result = await service.customer(req.body || {}); return res.status(result.error ? 400 : 200).json(result); } catch (error) { next(error); }
});
router.post('/api/chatbot/staff', async (req, res, next) => {
  try { const result = await service.staff(req.body || {}); return res.status(result.error ? 400 : 200).json(result); } catch (error) { next(error); }
});
router.post('/api/chatbot/customer-clarification', async (req, res, next) => {
  try { const result = await service.customerClarification(req.body || {}); return res.status(result.error ? 400 : 200).json(result); } catch (error) { next(error); }
});
router.post('/api/chatbot/customer-quote-response', async (req, res, next) => {
  try { const result = await service.customerQuoteResponse(req.body || {}); return res.status(result.error ? 400 : 200).json(result); } catch (error) { next(error); }
});
router.post('/api/chatbot/extract-phone', async (req, res, next) => {
  try { const result = await service.extractPhone(req.body || {}); return res.status(result.error ? 400 : 200).json(result); } catch (error) { next(error); }
});
router.post('/api/chatbot/extract-payment-party', async (req, res, next) => {
  try { const result = await service.extractPaymentParty(req.body || {}); return res.status(result.error ? 400 : 200).json(result); } catch (error) { next(error); }
});
router.post('/api/chatbot/extract-payment-time', async (req, res, next) => {
  try { const result = await service.extractPaymentTime(req.body || {}); return res.status(result.error ? 400 : 200).json(result); } catch (error) { next(error); }
});
router.post('/api/chatbot/translate', async (req, res, next) => {
  try { const result = await service.translate(req.body || {}); return res.status(result.error ? 400 : 200).json(result); } catch (error) { next(error); }
});
router.post('/api/chatbot/transcribe', async (req, res, next) => {
  try { const result = await service.transcribe(req.body || {}); return res.status(result.error ? 400 : 200).json(result); } catch (error) { next(error); }
});
