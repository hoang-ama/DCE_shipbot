import { ThinkingLevel } from '@google/genai';
import { apiKey, geminiState } from '../models/gemini';

export { apiKey, geminiState };

export async function callWithTimeout<T>(promise: Promise<T>, timeoutMs = 6000): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

export function isGeminiQuotaError(err: any): boolean {
  return Boolean(
    err?.status === 'RESOURCE_EXHAUSTED' ||
      err?.message?.includes('429') ||
      err?.message?.includes('RESOURCE_EXHAUSTED') ||
      err?.message?.includes('quota')
  );
}

export async function callGeminiStructured(
  prompt: string,
  schema: any
): Promise<{ data: any; model_used: string }> {
  if (!geminiState.ai) {
    throw new Error('Gemini client is not initialized');
  }

  const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
  let lastError: any = null;

  for (const model of candidateModels) {
    try {
      const thinkingConfig =
        model === 'gemini-3.8-flash'
          ? { thinkingLevel: ThinkingLevel.LOW }
          : model === 'gemini-3.1-flash-lite'
          ? { thinkingLevel: ThinkingLevel.MINIMAL }
          : undefined;

      const response = await callWithTimeout(
        geminiState.ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            ...(thinkingConfig ? { thinkingConfig } : {}),
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        }),
        6000
      );

      const parsed = JSON.parse(response.text || '{}');
      return { data: parsed, model_used: model };
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError;
}
