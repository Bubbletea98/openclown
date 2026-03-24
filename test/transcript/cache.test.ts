import { describe, it, expect } from "vitest";
import {
  getNextRefNum,
  setReplyTarget,
  consumeReplyTarget,
  addExchange,
  getLatestExchange,
  findExchangeByRef,
  findExchangeByKeyword,
  type CachedExchange,
} from "../../src/transcript/cache.js";

const makeExchange = (refNum: number, userRequest: string): CachedExchange => ({
  refNum,
  userRequest,
  toolCalls: [],
  assistantResponse: `Response to: ${userRequest}`,
  rawMessages: [],
  timestamp: Date.now(),
});

describe("getNextRefNum", () => {
  it("increments globally", () => {
    const a = getNextRefNum();
    const b = getNextRefNum();
    expect(b).toBe(a + 1);
  });
});

describe("replyTarget cache", () => {
  it("stores and consumes reply target", () => {
    const key = `test-reply-${Date.now()}`;
    setReplyTarget(key, 42);
    expect(consumeReplyTarget(key)).toBe(42);
    expect(consumeReplyTarget(key)).toBeUndefined();
  });

  it("returns undefined for unknown key", () => {
    expect(consumeReplyTarget("nonexistent")).toBeUndefined();
  });
});

describe("exchange cache", () => {
  it("adds and retrieves latest exchange", () => {
    const ex = makeExchange(900, "test latest");
    addExchange(ex);
    const latest = getLatestExchange();
    expect(latest).toBeDefined();
    expect(latest?.refNum).toBe(900);
  });

  it("finds exchange by ref number", () => {
    const ex = makeExchange(901, "find by ref");
    addExchange(ex);
    expect(findExchangeByRef(901)?.userRequest).toBe("find by ref");
  });

  it("finds exchange by keyword", () => {
    addExchange(makeExchange(902, "Find restaurants nearby"));
    addExchange(makeExchange(903, "Book a hotel room"));
    expect(findExchangeByKeyword("restaurant")?.refNum).toBe(902);
    expect(findExchangeByKeyword("hotel")?.refNum).toBe(903);
  });

  it("keyword search returns latest match", () => {
    addExchange(makeExchange(904, "good food place"));
    addExchange(makeExchange(905, "best food spot"));
    expect(findExchangeByKeyword("food")?.refNum).toBe(905);
  });
});
