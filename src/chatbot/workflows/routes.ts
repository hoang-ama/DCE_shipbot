import { Router } from 'express';
import { processRideMessage } from './dichung';
import { dispatchStep, newDispatch } from './dispatch';
import { randomUUID } from 'node:crypto';
import type { DispatchState } from './dispatch';
export const router = Router();
const sessions = new Map<string, DispatchState>();
const busy = new Set<string>();
router.post('/api/dev/ride', async (req, res, next) => {
  if (typeof req.body?.message !== 'string' || !req.body.message.trim()) return res.status(400).json({error:'Message required'});
  try { return res.json(await processRideMessage(req.body.message, req.body.info)); } catch (e) { next(e); }
});
router.post('/api/dev/dispatch', (_req,res) => { if(sessions.size>=1000)return res.status(429).json({error:'Sandbox full'});const id=randomUUID();const session=newDispatch();sessions.set(id,session);res.status(201).json({id,session}); });
router.post('/api/dev/dispatch/:id/message', async (req,res) => {
  const id=req.params.id; const session=sessions.get(id); if(!session)return res.status(404).json({error:'Session not found'});
  if(busy.has(id))return res.status(409).json({error:'Session busy'});
  const {from,message}=req.body || {}; if(!['customer','DCE','CSDT'].includes(from) || typeof message!=='string' || !message.trim())return res.status(400).json({error:'Invalid sender or message'});
  busy.add(id);try {const result=await dispatchStep(session,from,message);sessions.set(id,result.session);return res.json(result);}catch(e:any){return res.status(400).json({error:e.message});}finally{busy.delete(id);}
});
router.delete('/api/dev/dispatch/:id', (req,res) => { if(busy.has(req.params.id))return res.sendStatus(409);sessions.delete(req.params.id);return res.sendStatus(204); });
