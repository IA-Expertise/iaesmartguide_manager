const TTL_MS = 10 * 60 * 1000;
const seen = new Map<string, number>();

function prune(): void {
  const now = Date.now();
  for (const [id, at] of seen) {
    if (now - at > TTL_MS) seen.delete(id);
  }
}

/** Meta/Replit podem entregar o mesmo webhook mais de uma vez */
export function isDuplicateWebhookMessage(messageId: string | undefined): boolean {
  if (!messageId) return false;
  prune();
  if (seen.has(messageId)) return true;
  seen.set(messageId, Date.now());
  return false;
}
