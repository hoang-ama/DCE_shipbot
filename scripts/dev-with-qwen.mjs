import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerUrl = 'http://127.0.0.1:8765/health';
let workerProcess;
let serverProcess;
let ownsWorker = false;
let shuttingDown = false;

async function workerIsReady() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 700);
  try {
    const response = await fetch(workerUrl, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startWorkerIfNeeded() {
  if (await workerIsReady()) {
    console.log('[dev] Reusing Qwen worker already listening on 127.0.0.1:8765');
    return true;
  }

  console.log('[dev] Starting local Qwen worker for passenger-transport experiments…');
  workerProcess = spawn('uv', [
    'run', '--project', 'chatbot/passenger-transport/llm',
    'python', 'chatbot/passenger-transport/llm/serve_qwen.py',
  ], { cwd: root, stdio: 'inherit', env: process.env });
  ownsWorker = true;
  workerProcess.on('error', (error) => console.error('[dev] Could not start Qwen worker:', error.message));

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await workerIsReady()) {
      console.log('[dev] Qwen worker ready. Model weights load on the first experiment request.');
      return true;
    }
    if (workerProcess.exitCode !== null) break;
    await delay(500);
  }

  console.warn('[dev] Qwen worker did not become ready. Main Gemini chat will still start; passenger experiment will report Qwen unavailable.');
  return false;
}

function stopChildren(signal = 'SIGTERM') {
  if (serverProcess && serverProcess.exitCode === null) serverProcess.kill(signal);
  if (ownsWorker && workerProcess && workerProcess.exitCode === null) workerProcess.kill('SIGTERM');
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopChildren(signal);
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

await startWorkerIfNeeded();
serverProcess = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
serverProcess.on('error', (error) => {
  console.error('[dev] Could not start Node server:', error.message);
  stopChildren();
  process.exitCode = 1;
});
serverProcess.on('exit', (code, signal) => {
  if (ownsWorker && workerProcess && workerProcess.exitCode === null) workerProcess.kill('SIGTERM');
  if (!shuttingDown) process.exit(code ?? (signal ? 1 : 0));
});
