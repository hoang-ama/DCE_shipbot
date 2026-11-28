import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { runPassengerAgentTurn, type PassengerAgentTurnInput } from './agent';
export const passengerTransportRouter = Router();

type AgentJob =
  | { status: 'running'; createdAt: number }
  | { status: 'done'; createdAt: number; result: Awaited<ReturnType<typeof runPassengerAgentTurn>> }
  | { status: 'error'; createdAt: number; error: string };
const agentJobs = new Map<string, AgentJob>();
const JOB_TTL_MS = 30 * 60 * 1000;
const JOB_TIMEOUT_MS = 180 * 1000;

function pruneJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of agentJobs) if (job.createdAt < cutoff) agentJobs.delete(id);
}

passengerTransportRouter.post('/api/passenger-transport/agent-turn', async (req, res) => {
  const { event, message, booking, experimentId, history } = req.body || {};
  if (event !== 'message' && event !== 'booking_ready') return res.status(400).json({ error: 'event must be message or booking_ready' });
  const started = Date.now();
  console.info('[Passenger Agent] turn started', { event, experimentId });
  pruneJobs();
  const jobId = randomUUID();
  agentJobs.set(jobId, { status: 'running', createdAt: Date.now() });
  const timeout = setTimeout(() => {
    const job = agentJobs.get(jobId);
    if (job?.status === 'running') {
      agentJobs.set(jobId, { status: 'error', createdAt: Date.now(), error: 'CHAT_JOB_TIMEOUT: Qwen/Gemini processing exceeded 3 minutes' });
      console.error(`[Passenger Agent] turn timed out after ${JOB_TIMEOUT_MS}ms`, { event, experimentId, jobId });
    }
  }, JOB_TIMEOUT_MS);
  timeout.unref?.();
  void runPassengerAgentTurn({ event, message, booking, experimentId, history } as PassengerAgentTurnInput)
    .then((result) => {
      if (agentJobs.get(jobId)?.status !== 'running') return;
      agentJobs.set(jobId, { status: 'done', createdAt: Date.now(), result });
      console.info('[Passenger Agent] turn completed', { event, experimentId, source: result.source, reason: result.reason, elapsedMs: Date.now() - started });
    })
    .catch((error: unknown) => {
      if (agentJobs.get(jobId)?.status !== 'running') return;
      const errorMessage = error instanceof Error ? error.message : 'Passenger agent failed';
      agentJobs.set(jobId, { status: 'error', createdAt: Date.now(), error: errorMessage });
      console.error('[Passenger Agent] Turn failed:', error instanceof Error ? error.stack || error.message : 'Unknown error');
    }).finally(() => clearTimeout(timeout));
  return res.status(202).json({ jobId, status: 'running' });
});

passengerTransportRouter.get('/api/passenger-transport/agent-turn/:jobId', (req, res) => {
  const job = agentJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Passenger agent job not found or expired' });
  if (job.status === 'running') return res.status(202).json({ status: 'running' });
  if (job.status === 'error') return res.status(500).json({ status: 'error', error: job.error });
  return res.json({ status: 'done', ...job.result });
});
