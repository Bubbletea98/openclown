import { describe, it, expect, vi } from "vitest";
import { createParallelEngine } from "../../src/circus/engine.js";
import type { Circus } from "../../src/circus/types.js";
import type { CachedExchange } from "../../src/transcript/cache.js";

const TEST_CIRCUS: Circus = {
  performers: [
    { id: "philosopher", name: "Philosopher", emoji: "🎭", prompt: "You are a philosopher.", severity: "insight" },
    { id: "security", name: "Security", emoji: "🔒", prompt: "You are a security expert.", severity: "warning" },
    { id: "developer", name: "Developer", emoji: "💻", prompt: "You are a developer.", severity: "critical" },
  ],
};

describe("createParallelEngine", () => {
  const mockExchange: CachedExchange = {
    refNum: 1,
    userRequest: "给我找top 3高分餐厅",
    toolCalls: [
      { role: "tool", content: "Google Maps API results: 鼎泰丰 4.8, 海底捞 4.7, 小龙坎 4.6" },
    ],
    assistantResponse:
      "这是Top 3餐厅：\n1. 鼎泰丰 (4.8⭐)\n2. 海底捞 (4.7⭐)\n3. 小龙坎 (4.6⭐)",
    rawMessages: [],
    timestamp: Date.now(),
  };

  it("runs all performers in parallel and returns structured result", async () => {
    // Each call returns a different response based on call order
    const mockLlm = vi.fn()
      .mockResolvedValueOnce("Rating的定义值得商榷。")
      .mockResolvedValueOnce("API调用中传递了用户精确坐标。")
      .mockResolvedValueOnce("缺少对Google Maps API的错误处理。");

    const engine = createParallelEngine(mockLlm, 4000);
    const result = await engine.evaluate(mockExchange, TEST_CIRCUS);

    // All 3 performers called in parallel
    expect(mockLlm).toHaveBeenCalledTimes(3);
    expect(result.evaluations).toHaveLength(3);
    expect(result.evaluations[0].performer.id).toBe("philosopher");
    expect(result.evaluations[0].content).toContain("Rating");
    expect(result.evaluations[1].performer.id).toBe("security");
    expect(result.evaluations[1].content).toContain("API");
    expect(result.evaluations[2].performer.id).toBe("developer");
    expect(result.evaluations[2].content).toContain("Google Maps");
    expect(result.targetSummary).toContain("给我找top 3高分餐厅");
  });

  it("handles individual performer failure gracefully", async () => {
    const mockLlm = vi.fn()
      .mockResolvedValueOnce("Good evaluation here.")
      .mockRejectedValueOnce(new Error("API rate limited"))
      .mockResolvedValueOnce("Another good evaluation.");

    const engine = createParallelEngine(mockLlm, 4000);
    const result = await engine.evaluate(mockExchange, TEST_CIRCUS);

    // Should not throw — individual failures are caught
    expect(result.evaluations).toHaveLength(3);
    expect(result.evaluations[0].content).toBe("Good evaluation here.");
    expect(result.evaluations[1].content).toContain("Evaluation failed");
    expect(result.evaluations[2].content).toBe("Another good evaluation.");
  });

  it("handles all performers failing", async () => {
    const mockLlm = vi.fn().mockRejectedValue(new Error("API down"));

    const engine = createParallelEngine(mockLlm, 4000);
    const result = await engine.evaluate(mockExchange, TEST_CIRCUS);

    // Still returns a result, each performer has an error message
    expect(result.evaluations).toHaveLength(3);
    expect(result.evaluations[0].content).toContain("Evaluation failed");
    expect(result.evaluations[1].content).toContain("Evaluation failed");
    expect(result.evaluations[2].content).toContain("Evaluation failed");
  });
});
