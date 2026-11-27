import { liveZalo } from "../../config/env";
import { tokenState } from '../zalo/state';
import { asteriskState } from './state';

export const recentAsteriskCallTimestamps = new Map<string, number>();

export function normalizeVietnamPhone(raw: string): { local0: string; intl84: string; tail9: string } {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 11) {
    digits = '0' + digits.slice(2);
  } else if (digits.length === 9 && /^[35789]/.test(digits)) {
    digits = '0' + digits;
  }
  const tail9 = digits.slice(-9);
  const intl84 = digits.startsWith('0') ? '84' + digits.slice(1) : digits;
  return { local0: digits, intl84, tail9 };
}

export async function sendZaloZnsGreeting(intl84Phone: string, callId: string): Promise<{ success: boolean; error?: string }> {
  if (!liveZalo) return { success: false, error: "Zalo live disabled" };
  const token = tokenState.currentZaloAccessToken || process.env.ZALO_OA_ACCESS_TOKEN || '';
  if (!token || !asteriskState.zaloZnsTemplateId) {
    return { success: false, error: 'Chưa cấu hình ZALO_ZNS_TEMPLATE_ID hoặc Access Token' };
  }
  try {
    const res = await fetch('https://business.openapi.zalo.me/message/template', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: token,
      },
      body: JSON.stringify({
        phone: intl84Phone,
        template_id: asteriskState.zaloZnsTemplateId,
        template_data: {
          customer_name: 'Quý khách',
          phone: intl84Phone,
          call_id: callId,
        },
        tracking_id: callId,
      }),
    });
    const data = await res.json();
    if (data?.error === 0) {
      return { success: true };
    }
    return { success: false, error: `[${data?.error}] ${data?.message || JSON.stringify(data)}` };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}
