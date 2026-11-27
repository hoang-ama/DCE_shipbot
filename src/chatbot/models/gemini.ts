import "../../config/env";
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

export const apiKey = process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY' ? '' : (process.env.GEMINI_API_KEY || '');

export const geminiState = {
  ai: null as GoogleGenAI | null,
};

if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
  geminiState.ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}
