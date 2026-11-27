import test from 'node:test';
import assert from 'node:assert/strict';
import type { ChatMessage } from '../src/shared/types';
import { completedTraceTurns, formatTraceTurn, formatRecentTraceTurns } from '../src/frontend/trace-copy';

function makeTurn(i: number): ChatMessage[] {
  return [
    { id: `u${i}`, sender: 'user', text: `Khách ${i}`, timestamp: '12:00' },
    { id: `b${i}`, sender: 'bot', replyToId: `u${i}`, text: `Bot ${i}`, timestamp: '12:01', aiTrace: {
      source: 'gemini', reason: 'FALLBACK', elapsedMs: 300, steps: [
        { node: 'qwen_extract', status: 'error', elapsedMs: 100, reason: 'INVALID_JSON', detail: { input: 'prompt input', rawOutput: '{invalid', error: { message: 'error text', cause: 'test cause' } } },
        { node: 'gemini', status: 'ok', detail: { output: { cargo: 'hoa quả' }, metadata: { tokens: 42 } } },
      ],
    } },
  ];
}

test('single copy includes the full trace and messages independent of UI expansion', () => {
  const turn = completedTraceTurns(makeTurn(1))[0];
  const payload = JSON.parse(formatTraceTurn(turn).split('\n').slice(1).join('\n'));
  assert.equal(payload.user.text, 'Khách 1');
  assert.equal(payload.bot.text, 'Bot 1');
  assert.deepEqual(payload.aiTrace, turn.reply.aiTrace);
});

test('copy all exports newest ten completed turns in original conversation order', () => {
  const messages = Array.from({ length: 13 }, (_, i) => makeTurn(i + 1)).flat();
  messages.push({ id: 'pending', sender: 'user', text: 'pending', timestamp: '12:05' });
  const text = formatRecentTraceTurns(completedTraceTurns(messages));
  assert.deepEqual([...text.matchAll(/========== LƯỢT (\d+) ==========/g)].map(m => Number(m[1])), [4,5,6,7,8,9,10,11,12,13]);
  assert.ok(!text.includes('pending'));
});

test('failed and missing trace responses remain exportable, pending turns do not', () => {
  const messages = makeTurn(1);
  messages[1].aiTrace = { source: 'error', reason: 'CHAT_REQUEST_FAILED', elapsedMs: 10, steps: [{ node: 'web_request', status: 'error', detail: { error: 'NetworkError' } }] };
  const noTrace = makeTurn(2); delete noTrace[1].aiTrace;
  messages.push(...noTrace, { id: 'u3', sender: 'user', text: 'waiting', timestamp: '12:00' });
  const turns = completedTraceTurns(messages);
  assert.equal(turns.length, 2);
  assert.match(formatRecentTraceTurns(turns), /NetworkError/);
  assert.match(formatTraceTurn(turns[1]), /Backend không trả trace/);
  assert.equal(formatRecentTraceTurns([]), '');
});
