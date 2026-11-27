import { Type } from '@google/genai';
import {
  apiKey,
  callGeminiStructured,
  callWithTimeout,
  geminiState,
  isGeminiQuotaError,
} from './gemini-structured';

/**
 * Normalize Vietnamese transport slang, voice-number phrasing, and currency shorthands
 * (e.g., "1tr2" -> "1.200.000 VNĐ", "500k" -> "500.000 VNĐ").
 */
export function expandVietnameseShorthand(text: string): string {
  let result = String(text || '');

  const wordDigits: Record<string, number> = {
    'một': 1, 'mot': 1, 'mốt': 1,
    'hai': 2, 'ba': 3, 'bốn': 4, 'tư': 4,
    'năm': 5, 'lăm': 5, 'sáu': 6, 'bảy': 7,
    'tám': 8, 'chín': 9, 'mười': 10,
  };
  result = result.replace(
    /\b(một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s+triệu\s+(rưỡi|một|mốt|hai|ba|bốn|tư|năm|lăm|sáu|bảy|tám|chín)?/gi,
    (_m, milWord: string, subWord?: string) => {
      const mil = wordDigits[milWord.toLowerCase()] || 1;
      let sub = 0;
      if (subWord) {
        sub =
          subWord.toLowerCase() === 'rưỡi'
            ? 500_000
            : (wordDigits[subWord.toLowerCase()] || 0) * 100_000;
      }
      const total = mil * 1_000_000 + sub;
      return `${total.toLocaleString('vi-VN').replace(/,/g, '.')} VNĐ`;
    }
  );
  result = result.replace(/\b(\d+)\s*(?:triệu|tr)\s*rưỡi\b/gi, (_m, milStr: string) => {
    const total = parseInt(milStr, 10) * 1_000_000 + 500_000;
    return `${total.toLocaleString('vi-VN').replace(/,/g, '.')} VNĐ`;
  });
  result = result.replace(/\b(\d+(?:[.,]\d+)?)\s*(?:nghìn|ngàn)\b/gi, (_m, numStr: string) => {
    const total = Math.round(parseFloat(numStr.replace(',', '.')) * 1_000);
    return `${total.toLocaleString('vi-VN').replace(/,/g, '.')} VNĐ`;
  });

  // 1. Handle XtrY patterns: 1tr2 -> 1.200.000 VNĐ, 1tr25 -> 1.250.000 VNĐ
  result = result.replace(/\b(\d+)\s*(?:tr|triệu|cu|củ)\s*(\d{1,3})\b/gi, (_match, millions, frac) => {
    const mil = parseInt(millions, 10);
    const padded = frac.padEnd(3, '0').slice(0, 3);
    const total = mil * 1_000_000 + parseInt(padded, 10) * 1_000;
    return `${total.toLocaleString('vi-VN').replace(/,/g, '.')} VNĐ`;
  });

  // 2. Handle decimal millions: 1.5tr / 2tr
  result = result.replace(/\b(\d+(?:[.,]\d+)?)\s*(?:tr|triệu)\b/gi, (_match, numStr) => {
    const num = parseFloat(numStr.replace(',', '.'));
    const total = Math.round(num * 1_000_000);
    return `${total.toLocaleString('vi-VN').replace(/,/g, '.')} VNĐ`;
  });

  // 3. Handle thousands: 500k / 450k
  result = result.replace(/\b(\d+(?:[.,]\d+)?)\s*k\b/gi, (_match, numStr) => {
    const num = parseFloat(numStr.replace(',', '.'));
    const total = Math.round(num * 1_000);
    return `${total.toLocaleString('vi-VN').replace(/,/g, '.')} VNĐ`;
  });

  // 4. Expand common abbreviations
  return result
    .replace(/\bko\b/gi, 'không')
    .replace(/\bk\b(?=\s|$|[.,!?])/gi, 'không')
    .replace(/\bđc\b/gi, 'được')
    .replace(/\bdc\b/gi, 'được')
    .replace(/\bhn\b/gi, 'Hà Nội')
    .replace(/\bhcm\b/gi, 'TP. Hồ Chí Minh')
    .replace(/\bsg\b/gi, 'TP. Hồ Chí Minh')
    .replace(/\bđn\b/gi, 'Đà Nẵng')
    .trim();
}

export function stripStaffToCskhFillers(text: string): string {
  return String(text || '')
    .replace(/\b(?:nhé|nha|nhe)\s*(?:em|bạn|shop|ad)?\b/gi, '')
    .replace(/(?:^|\s)(?:em|bạn|shop|ad)\s*[.,!?]*$/gi, '')
    .replace(/^(?:ok|oke|uk|ừ|dạ)\s*,?\s*/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/^[.,!?\s]+|[.,!?\s]+$/g, '')
    .trim();
}

export async function translateLogisticsText(body: {
  text?: string;
  targetLang?: string;
} = {}): Promise<any> {
  try {
    const { text, targetLang = 'auto' } = body;
    if (!text) {
      return { error: 'Text is required' };
    }

    if (!apiKey) {
      return {
        translated_text: expandVietnameseShorthand(text),
        detected_language: 'vi',
        model_used: 'smart-dispatch-engine',
      };
    }

    const prompt = `
Bạn là chuyên gia biên dịch logistics.
Hãy dịch nội dung tin nhắn sau:
"${text}"

Quy tắc:
- Nếu targetLang == "en": Dịch toàn bộ sang tiếng Anh chuyên ngành vận tải tự nhiên, chính xác.
- Nếu targetLang == "vi": Dịch toàn bộ sang tiếng Việt tự nhiên, rõ nghĩa (giải nghĩa các từ viết tắt nếu có).
- Nếu targetLang == "auto": Nếu văn bản chủ yếu là tiếng Việt thì dịch sang tiếng Anh; nếu văn bản là tiếng Anh hoặc ngôn ngữ khác thì dịch sang tiếng Việt.
(targetLang yêu cầu: "${targetLang}")
`;

    const { data: parsed, model_used } = await callGeminiStructured(prompt, {
      type: Type.OBJECT,
      properties: {
        translated_text: {
          type: Type.STRING,
          description: 'Nội dung tin nhắn đã được dịch',
        },
        detected_language: {
          type: Type.STRING,
          description: 'Ngôn ngữ gốc phát hiện được (vi, en, ...)',
        },
      },
      required: ['translated_text', 'detected_language'],
    });

    return {
      ...parsed,
      model_used,
    };
  } catch (err: any) {
    return {
      translated_text: expandVietnameseShorthand(body.text || ''),
      detected_language: 'vi',
      model_used: 'smart-dispatch-engine',
      quota_exceeded: isGeminiQuotaError(err),
    };
  }
}

export async function transcribeLogisticsAudio(body: {
  audioBase64?: string;
  mimeType?: string;
  browserTranscript?: string;
} = {}): Promise<any> {
  try {
    const { audioBase64, mimeType = 'audio/webm', browserTranscript = '' } = body;

    if (!audioBase64 && !browserTranscript) {
      return { error: 'Audio data or transcript is required' };
    }

    const base64Data =
      typeof audioBase64 === 'string'
        ? audioBase64.replace(/^data:[^;]+;base64,/, '').trim()
        : '';

    const normalizedMime = String(mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';
    const mappedMime = normalizedMime === 'audio/mp3' ? 'audio/mpeg' : normalizedMime;

    if (!apiKey || !geminiState.ai || !base64Data) {
      return {
        transcript: (browserTranscript || '').trim(),
        model_used: browserTranscript ? 'browser-speech' : 'unavailable',
        quota_exceeded: false,
      };
    }

    const audioPart = {
      inlineData: {
        mimeType: mappedMime,
        data: base64Data,
      },
    };

    const candidateModels = ['gemini-3.5-transcribe', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        const response = await callWithTimeout(
          geminiState.ai.models.generateContent({
            model,
            contents: {
              parts: [
                audioPart,
                {
                  text: 'Transcribe this audio verbatim. Keep Vietnamese or English words, prices, weights, dimensions, and addresses exact. Output only the transcribed text without quotes or commentary.',
                },
              ],
            },
          }),
          10000
        );

        const rawText = (response.text || '').trim();
        const isSilenceArtifact = /^(\d{1,2}:\d{2}|\[?silence\]?|\[?no audio\]?)$/i.test(rawText);
        if (rawText && !isSilenceArtifact) {
          return {
            transcript: rawText,
            model_used: model,
            quota_exceeded: false,
          };
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    return {
      transcript: (browserTranscript || '').trim(),
      model_used: browserTranscript ? 'browser-speech-fallback' : 'unavailable',
      quota_exceeded: isGeminiQuotaError(lastError),
    };
  } catch (err: any) {
    return {
      transcript: (body.browserTranscript || '').trim(),
      model_used: body.browserTranscript ? 'browser-speech-fallback' : 'unavailable',
      quota_exceeded: isGeminiQuotaError(err),
    };
  }
}
