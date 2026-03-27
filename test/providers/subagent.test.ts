import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLlmCaller } from "../../src/providers/index.js";

const mockLogger = { info: vi.fn(), warn: vi.fn() };

function makeSubagent(responseText: string) {
  return {
    run: vi.fn().mockResolvedValue({ runId: "run-123" }),
    waitForRun: vi.fn().mockResolvedValue({ status: "ok" }),
    getSessionMessages: vi.fn().mockResolvedValue({
      messages: [
        { role: "user", content: "the prompt" },
        { role: "assistant", content: responseText },
      ],
    }),
  };
}

// Reset module state between tests (subagentAvailable flag is module-level)
beforeEach(async () => {
  vi.resetModules();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
});

describe("createLlmCaller (subagent)", () => {
  it("returns assistant text from subagent response", async () => {
    const subagent = makeSubagent("This is the evaluation.");
    const llmCall = createLlmCaller(subagent, mockLogger, {});

    const result = await llmCall("You are a philosopher.", "Evaluate this task.");

    expect(result).toBe("This is the evaluation.");
    expect(subagent.run).toHaveBeenCalledOnce();
    expect(subagent.waitForRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-123", timeoutMs: 60_000 }),
    );
    expect(subagent.getSessionMessages).toHaveBeenCalledOnce();
  });

  it("passes system prompt via extraSystemPrompt and user prompt as message", async () => {
    const subagent = makeSubagent("ok");
    const llmCall = createLlmCaller(subagent, mockLogger, {});

    await llmCall("System prompt here", "User prompt here");

    const runParams = subagent.run.mock.calls[0][0] as Record<string, unknown>;
    expect(runParams.message).toBe("User prompt here");
    expect(runParams.extraSystemPrompt).toBe("System prompt here");
  });

  it("passes provider/model overrides when configured", async () => {
    const subagent = makeSubagent("ok");
    const llmCall = createLlmCaller(subagent, mockLogger, {
      provider: "openai",
      model: "gpt-4o",
    });

    await llmCall("sys", "user");

    const runParams = subagent.run.mock.calls[0][0] as Record<string, unknown>;
    expect(runParams.provider).toBe("openai");
    expect(runParams.model).toBe("gpt-4o");
  });

  it("does not pass provider/model when not configured", async () => {
    const subagent = makeSubagent("ok");
    const llmCall = createLlmCaller(subagent, mockLogger, {});

    await llmCall("sys", "user");

    const runParams = subagent.run.mock.calls[0][0] as Record<string, unknown>;
    expect(runParams.provider).toBeUndefined();
    expect(runParams.model).toBeUndefined();
  });

  it("handles content block array format", async () => {
    const subagent = {
      run: vi.fn().mockResolvedValue({ runId: "run-456" }),
      waitForRun: vi.fn().mockResolvedValue({ status: "ok" }),
      getSessionMessages: vi.fn().mockResolvedValue({
        messages: [
          {
            role: "assistant",
            content: [
              { type: "text", text: "Part one." },
              { type: "text", text: "Part two." },
            ],
          },
        ],
      }),
    };

    const llmCall = createLlmCaller(subagent, mockLogger, {});
    const result = await llmCall("sys", "user");

    expect(result).toBe("Part one.\nPart two.");
  });

  it("throws on empty response", async () => {
    const subagent = {
      run: vi.fn().mockResolvedValue({ runId: "run-789" }),
      waitForRun: vi.fn().mockResolvedValue({ status: "ok" }),
      getSessionMessages: vi.fn().mockResolvedValue({ messages: [] }),
    };

    const llmCall = createLlmCaller(subagent, mockLogger, {});
    await expect(llmCall("sys", "user")).rejects.toThrow("Empty response");
  });

  it("throws on error status", async () => {
    const subagent = {
      run: vi.fn().mockResolvedValue({ runId: "run-err" }),
      waitForRun: vi.fn().mockResolvedValue({ status: "error", error: "model not found" }),
      getSessionMessages: vi.fn(),
    };

    const llmCall = createLlmCaller(subagent, mockLogger, {});
    await expect(llmCall("sys", "user")).rejects.toThrow("model not found");
    expect(subagent.getSessionMessages).not.toHaveBeenCalled();
  });

  it("throws on timeout status", async () => {
    const subagent = {
      run: vi.fn().mockResolvedValue({ runId: "run-timeout" }),
      waitForRun: vi.fn().mockResolvedValue({ status: "timeout" }),
      getSessionMessages: vi.fn(),
    };

    const llmCall = createLlmCaller(subagent, mockLogger, {});
    await expect(llmCall("sys", "user")).rejects.toThrow("timed out");
    expect(subagent.getSessionMessages).not.toHaveBeenCalled();
  });

  it("generates unique session keys per call", async () => {
    const subagent = makeSubagent("ok");
    const llmCall = createLlmCaller(subagent, mockLogger, {});

    await llmCall("sys", "user1");
    await llmCall("sys", "user2");

    const key1 = (subagent.run.mock.calls[0][0] as Record<string, unknown>).sessionKey;
    const key2 = (subagent.run.mock.calls[1][0] as Record<string, unknown>).sessionKey;
    expect(key1).not.toBe(key2);
  });
});
