import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createOpenAIProvider } from "../../src/providers/openai.js";

const mockLogger = { info: vi.fn() };

describe("createOpenAIProvider", () => {
  const originalEnv = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    if (originalEnv) process.env.OPENAI_API_KEY = originalEnv;
    else delete process.env.OPENAI_API_KEY;
    vi.unstubAllGlobals();
  });

  it("has name 'openai'", () => {
    const provider = createOpenAIProvider(mockLogger, { openaiApiKey: "sk-test" });
    expect(provider.name).toBe("openai");
  });

  it("throws when no API key is available", async () => {
    const provider = createOpenAIProvider(mockLogger, {});
    await expect(provider.call("sys", "user")).rejects.toThrow("No OpenAI API key found");
  });

  it("calls OpenAI API with correct payload", async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: "Hello from GPT" } }],
      }),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const provider = createOpenAIProvider(mockLogger, {
      openaiApiKey: "sk-test-key",
      model: "gpt-4o-mini",
    });

    const result = await provider.call("You are helpful", "What is 2+2?");

    expect(result).toBe("Hello from GPT");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test-key",
        }),
      }),
    );

    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages[0]).toEqual({ role: "system", content: "You are helpful" });
    expect(body.messages[1]).toEqual({ role: "user", content: "What is 2+2?" });
  });

  it("uses custom baseUrl", async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: "Hello from Ollama" } }],
      }),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const provider = createOpenAIProvider(mockLogger, {
      baseUrl: "http://localhost:11434/v1",
      model: "llama3",
    });

    const result = await provider.call("sys", "user");

    expect(result).toBe("Hello from Ollama");
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:11434/v1/chat/completions",
      expect.anything(),
    );
  });

  it("skips API key for local endpoints", async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: "ok" } }],
      }),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const provider = createOpenAIProvider(mockLogger, {
      baseUrl: "http://localhost:11434/v1",
    });

    // Should not throw even without an API key
    await provider.call("sys", "user");

    const headers = (fetch as any).mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer no-key-needed");
  });

  it("resolves key from env var", async () => {
    process.env.OPENAI_API_KEY = "sk-from-env";

    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: "ok" } }],
      }),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const provider = createOpenAIProvider(mockLogger, {});
    await provider.call("sys", "user");

    const headers = (fetch as any).mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer sk-from-env");
  });

  it("throws on API error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: vi.fn().mockResolvedValue("Rate limit exceeded"),
      }),
    );

    const provider = createOpenAIProvider(mockLogger, { openaiApiKey: "sk-test" });
    await expect(provider.call("sys", "user")).rejects.toThrow("OpenAI API error (429)");
  });
});
