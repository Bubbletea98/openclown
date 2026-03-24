export type CachedMessage = {
  role: string;
  content: unknown;
  id?: string;
};

export type CachedExchange = {
  refNum: number;
  userRequest: string;
  toolCalls: CachedMessage[];
  assistantResponse: string;
  thinking?: string[];
  executedTools?: Array<{ name: string; arguments: Record<string, unknown> }>;
  rawMessages: CachedMessage[];
  timestamp: number;
};

/**
 * Global exchange cache.
 * MVP simplification: single list of recent exchanges, no per-channel keying.
 * This works because most users have one active conversation at a time.
 */
const recentExchanges: CachedExchange[] = [];
const MAX_CACHED_EXCHANGES = 50;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

let refCounter = 0;

// Temp lookup: for reply targeting (inbound_claim → command handler)
const replyTargetCache = new Map<string, { refNum: number; expiresAt: number }>();

export function getNextRefNum(): number {
  return ++refCounter;
}

export function addExchange(exchange: CachedExchange): void {
  pruneExpired();
  recentExchanges.push(exchange);
  if (recentExchanges.length > MAX_CACHED_EXCHANGES) {
    recentExchanges.shift();
  }
}

export function getLatestExchange(): CachedExchange | undefined {
  pruneExpired();
  return recentExchanges.length > 0
    ? recentExchanges[recentExchanges.length - 1]
    : undefined;
}

export function findExchangeByRef(refNum: number): CachedExchange | undefined {
  return recentExchanges.find((e) => e.refNum === refNum);
}

/**
 * Get up to `count` exchanges that occurred before the given exchange (by refNum).
 * Returns them in chronological order (oldest first).
 */
export function getExchangesBefore(refNum: number, count: number): CachedExchange[] {
  pruneExpired();
  const idx = recentExchanges.findIndex((e) => e.refNum === refNum);
  if (idx <= 0) return [];
  const start = Math.max(0, idx - count);
  return recentExchanges.slice(start, idx);
}

export function findExchangeByKeyword(keyword: string): CachedExchange | undefined {
  const lower = keyword.toLowerCase();
  return [...recentExchanges]
    .reverse()
    .find(
      (e) =>
        e.userRequest.toLowerCase().includes(lower) ||
        e.assistantResponse.toLowerCase().includes(lower),
    );
}

export function setReplyTarget(key: string, refNum: number): void {
  replyTargetCache.set(key, {
    refNum,
    expiresAt: Date.now() + 10_000, // 10 second TTL
  });
}

export function consumeReplyTarget(key: string): number | undefined {
  const entry = replyTargetCache.get(key);
  if (!entry) return undefined;
  replyTargetCache.delete(key);
  if (Date.now() > entry.expiresAt) return undefined;
  return entry.refNum;
}

function pruneExpired(): void {
  const cutoff = Date.now() - CACHE_TTL_MS;
  while (recentExchanges.length > 0 && recentExchanges[0].timestamp < cutoff) {
    recentExchanges.shift();
  }
}
