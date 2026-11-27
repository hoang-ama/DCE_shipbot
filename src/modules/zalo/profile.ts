import { liveZalo } from "../../config/env";
import { tokenState } from './state';

export async function fetchZaloUserProfile(userId: string): Promise<{ display_name?: string; avatar?: string; phone?: string } | null> {
  if (!liveZalo) return null;
  const token = tokenState.currentZaloAccessToken || process.env.ZALO_OA_ACCESS_TOKEN || '';
  if (!token) return null;

  try {
    const res = await fetch(`https://openapi.zalo.me/v2.0/oa/getprofile?data=${encodeURIComponent(JSON.stringify({ user_id: userId }))}`, {
      headers: { access_token: token },
    });
    const json = await res.json();
    if (json?.error === 0 && json?.data) {
      return {
        display_name: json.data.display_name,
        avatar: json.data.avatar,
        phone: json.data.shared_info?.phone ? String(json.data.shared_info.phone) : undefined,
      };
    }
  } catch (_) { }
  return null;
}
