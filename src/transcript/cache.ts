import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

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

// --- Persistence ---

const PERSIST_DIR = join(homedir(), ".openclaw", "openclown");
const PERSIST_FILE = join(PERSIST_DIR, "exchanges.json");

type PersistedData = {
  refCounter: number;
  exchanges: CachedExchange[];
};

function loadFromDisk(): PersistedData | null {
  try {
    const raw = readFileSync(PERSIST_FILE, "utf-8");
    const data = JSON.parse(raw) as PersistedData;
    if (typeof data.refCounter === "number" && Array.isArray(data.exchanges)) {
      return data;
    }
  } catch {
    // File doesn't exist yet or is invalid
  }
  return null;
}

function saveToDisk(): void {
  try {
    mkdirSync(PERSIST_DIR, { recursive: true });
    const data: PersistedData = {
      refCounter,
      // Only persist the serializable fields (drop rawMessages to save space)
      exchanges: recentExchanges.map((e) => ({
        refNum: e.refNum,
        userRequest: e.userRequest,
        toolCalls: [], // Don't persist raw tool call content
        assistantResponse: e.assistantResponse,
        thinking: e.thinking,
        executedTools: e.executedTools,
        rawMessages: [], // Don't persist raw messages (too large)
        timestamp: e.timestamp,
      })),
    };
    writeFileSync(PERSIST_FILE, JSON.stringify(data, null, 2));
  } catch {
    // Silently fail — persistence is best-effort
  }
}

// --- State ---

const MAX_CACHED_EXCHANGES = 50;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours (was 30 minutes)

// Load persisted state on startup
const persisted = loadFromDisk();
const recentExchanges: CachedExchange[] = persisted?.exchanges ?? [];
let refCounter: number = persisted?.refCounter ?? 0;

// Prune expired entries loaded from disk
pruneExpired();

if (persisted) {
  console.log(
    `[openclown] Restored ${recentExchanges.length} cached exchanges, refCounter=${refCounter}`,
  );
}

// Temp lookup: for reply targeting (inbound_claim → command handler)
const replyTargetCache = new Map<string, { refNum: number; expiresAt: number }>();

// --- Track whether current command was resolved via reply ---

let lastReplyResolved = false;

export function setReplyResolved(resolved: boolean): void {
  lastReplyResolved = resolved;
}

export function wasReplyResolved(): boolean {
  return lastReplyResolved;
}

// --- Public API ---

export function getNextRefNum(): number {
  ++refCounter;
  saveToDisk(); // Persist counter so it survives restarts
  return refCounter;
}

export function addExchange(exchange: CachedExchange): void {
  pruneExpired();
  recentExchanges.push(exchange);
  if (recentExchanges.length > MAX_CACHED_EXCHANGES) {
    recentExchanges.shift();
  }
  saveToDisk();
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
