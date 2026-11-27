

// Lưu ánh xạ hai chiều giữa user_id_by_app và OA user_id (sender.id / recipient.id)
const zaloIdAliases = new Map<string, Set<string>>();

export function linkZaloIds(...ids: Array<string | undefined | null>) {
  const valid = Array.from(new Set(ids.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)));
  if (valid.length < 2) return;
  for (const a of valid) {
    if (!zaloIdAliases.has(a)) zaloIdAliases.set(a, new Set());
    for (const b of valid) {
      if (a !== b) zaloIdAliases.get(a)!.add(b);
    }
  }
}

export function getLinkedZaloIds(id: string | undefined | null): string[] {
  const clean = typeof id === 'string' ? id.trim() : '';
  if (!clean) return [];
  const res = new Set<string>([clean]);
  const set = zaloIdAliases.get(clean);
  if (set) {
    for (const alias of set) res.add(alias);
  }
  return Array.from(res);
}

export const recentBotOutboundMessages = new Map<string, number>();

function normalizeOutboundKey(userId: string, text: string): string {
  const norm = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${userId}::${norm}`;
}

export function markBotSentMessage(userId: string, text: string) {
  const exp = Date.now() + 60 * 1000;
  for (const uid of getLinkedZaloIds(userId)) {
    recentBotOutboundMessages.set(normalizeOutboundKey(uid, text), exp);
  }
}

export function wasRecentlySentByBot(userIds: string | string[], text: string): boolean {
  const now = Date.now();
  for (const [k, exp] of recentBotOutboundMessages.entries()) {
    if (exp < now) recentBotOutboundMessages.delete(k);
  }
  const candidates = new Set<string>();
  const list = Array.isArray(userIds) ? userIds : [userIds];
  for (const id of list) {
    for (const linked of getLinkedZaloIds(id)) {
      candidates.add(linked);
    }
  }
  for (const uid of candidates) {
    const key = normalizeOutboundKey(uid, text);
    if (recentBotOutboundMessages.has(key)) {
      recentBotOutboundMessages.delete(key);
      return true;
    }
  }
  return false;
}
