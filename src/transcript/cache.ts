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
  toolCallSummaries?: string[];
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
      exchanges: recentExchanges.map((e) => ({
        refNum: e.refNum,
        userRequest: e.userRequest,
        toolCalls: [], // Don't persist raw tool call content
        assistantResponse: e.assistantResponse,
        thinking: e.thinking,
        executedTools: e.executedTools,
        toolCallSummaries: e.toolCallSummaries,
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
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

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

// Temp lookup: for reply targeting via [🎪 #N] tag
const replyTargetCache = new Map<string, { refNum: number; expiresAt: number }>();

// Temp lookup: for reply targeting via quoted text content matching
const replyContentCache = new Map<string, { quotedText: string; expiresAt: number }>();

// --- Public API ---

export function getNextRefNum(): number {
  ++refCounter;
  saveToDisk();
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

/**
 * Find an exchange by matching quoted text against assistantResponse.
 * Uses substring matching with normalization. Prefers the most recent match.
 */
export function findExchangeByContent(quotedText: string): CachedExchange | undefined {
  if (!quotedText || quotedText.length < 5) return undefined;

  const normalized = normalizeForMatch(quotedText);

  // Search in reverse (most recent first) — recency bias
  return [...recentExchanges]
    .reverse()
    .find((e) => normalizeForMatch(e.assistantResponse).includes(normalized));
}

/**
 * Normalize text for fuzzy content matching.
 * Strips whitespace variations, markdown, and common formatting differences.
 */
function normalizeForMatch(text: string): string {
  return text
    .replace(/\s+/g, " ") // collapse whitespace
    .replace(/[*_~`#]/g, "") // strip markdown
    .trim()
    .toLowerCase();
}

// --- Reply target via [🎪 #N] tag ---

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

// --- Reply target via quoted text content ---

export function setReplyContent(key: string, quotedText: string): void {
  replyContentCache.set(key, {
    quotedText,
    expiresAt: Date.now() + 10_000, // 10 second TTL
  });
}

export function consumeReplyContent(key: string): string | undefined {
  const entry = replyContentCache.get(key);
  if (!entry) return undefined;
  replyContentCache.delete(key);
  if (Date.now() > entry.expiresAt) return undefined;
  return entry.quotedText;
}

function pruneExpired(): void {
  const cutoff = Date.now() - CACHE_TTL_MS;
  while (recentExchanges.length > 0 && recentExchanges[0].timestamp < cutoff) {
    recentExchanges.shift();
  }
}
