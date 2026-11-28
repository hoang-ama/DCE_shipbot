import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { runCargoAgentTurn } from './agent';

export const cargoTransportRouter = Router();
const jobs = new Map<string, { createdAt: number; status: 'running' | 'done' | 'error'; result?: unknown; error?: string }>();
const TTL = 30 * 60 * 1000;
const JOB_TIMEOUT_MS = 60 * 1000;

cargoTransportRouter.post('/api/cargo-transport/agent-turn', (req, res) => {
  const { experimentId, message, history, currentInfo } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'message is required' });
  for (const [id, job] of jobs) if (job.createdAt < Date.now() - TTL) jobs.delete(id);
  const jobId = randomUUID();
  jobs.set(jobId, { createdAt: Date.now(), status: 'running' });
  const timeout = setTimeout(() => {
    const job = jobs.get(jobId);
    if (job?.status === 'running') {
      jobs.set(jobId, { createdAt: Date.now(), status: 'error', error: 'CHAT_JOB_TIMEOUT: Qwen/Gemini processing exceeded 1 minute' });
      console.error(`[Cargo Agent] turn timed out after ${JOB_TIMEOUT_MS}ms`, { experimentId, jobId });
    }
  }, JOB_TIMEOUT_MS);
  timeout.unref?.();
  console.info('[Cargo Agent] turn started', { experimentId });
  void runCargoAgentTurn({ experimentId: String(experimentId || ''), message, history, currentInfo })
    .then((result) => {
      if (jobs.get(jobId)?.status !== 'running') return;
      jobs.set(jobId, { createdAt: Date.now(), status: 'done', result });
      console.info('[Cargo Agent] turn completed', { experimentId, source: result.source, reason: result.reason, elapsedMs: result.elapsedMs });
    })
    .catch((error: unknown) => {
      if (jobs.get(jobId)?.status !== 'running') return;
      const detail = error instanceof Error ? error.stack || error.message : 'Unknown cargo agent error';
      jobs.set(jobId, { createdAt: Date.now(), status: 'error', error: error instanceof Error ? error.message : 'Cargo agent failed' });
      console.error('[Cargo Agent] turn failed', detail);
    }).finally(() => clearTimeout(timeout));
  return res.status(202).json({ jobId, status: 'running' });
});

cargoTransportRouter.get('/api/cargo-transport/agent-turn/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Cargo agent job not found or expired' });
  if (job.status === 'running') return res.status(202).json({ status: 'running' });
  if (job.status === 'error') return res.status(500).json({ status: 'error', error: job.error });
  return res.json({ status: 'done', ...(job.result as Record<string, unknown>) });
});
