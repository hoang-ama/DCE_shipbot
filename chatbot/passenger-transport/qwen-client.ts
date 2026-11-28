const QWEN_URL = process.env.QWEN_LOCAL_URL || 'http://127.0.0.1:8765';

export async function callPassengerQwen(system: string, input: unknown, maxNewTokens = 700, timeoutMs = 180_000) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(QWEN_URL + '/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ system, input, max_new_tokens: maxNewTokens }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as { text?: string; error?: string; model?: string };
    if (!response.ok || typeof body.text !== 'string') throw new Error(body.error || 'QWEN_HTTP_' + response.status);
    return { text: body.text, model: body.model || 'Qwen/Qwen3-0.6B', elapsedMs: Date.now() - started };
  } catch (error) {
    if (timedOut) throw new Error(`QWEN_TIMEOUT: no response within ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function parsePassengerQwenJson(text: string): any {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/giu, '').replace(/^\s*`{3}(?:json)?/iu, '').replace(/`{3}\s*$/u, '').trim();
  const candidate = cleaned.match(/\{[\s\S]*\}/u)?.[0];
  if (!candidate) throw new Error('QWEN_JSON_MISSING');
  return JSON.parse(candidate);
}
