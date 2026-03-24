import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAnthropicProvider } from "../../src/providers/anthropic.js";

const mockLogger = { info: vi.fn(), warn: vi.fn() };

function makeApi(pluginConfig?: Record<string, unknown>) {
  return {
    runtime: {
      modelAuth: {
        resolveApiKeyForProvider: vi.fn().mockResolvedValue(null),
      },
    },
    config: {},
    logger: mockLogger,
  };
}

describe("createAnthropicProvider", () => {
  const originalEnv = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalEnv) process.env.ANTHROPIC_API_KEY = originalEnv;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  it("has name 'anthropic'", () => {
    const api = makeApi();
    const provider = createAnthropicProvider(api, { anthropicApiKey: "sk-test" });
    expect(provider.name).toBe("anthropic");
  });

  it("throws when no API key is available", async () => {
    const api = makeApi();
    const provider = createAnthropicProvider(api, {});
    await expect(provider.call("sys", "user")).rejects.toThrow("No Anthropic API key found");
  });

  it("calls Anthropic API with correct payload", async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Hello from Claude" }],
      }),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const api = makeApi();
    const provider = createAnthropicProvider(api, {
      anthropicApiKey: "sk-test-key",
      model: "claude-haiku-4-5-20251001",
    });

    const result = await provider.call("You are helpful", "What is 2+2?");

    expect(result).toBe("Hello from Claude");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "sk-test-key",
          "anthropic-version": "2023-06-01",
        }),
      }),
    );

    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.model).toBe("claude-haiku-4-5-20251001");
    expect(body.system).toBe("You are helpful");
    expect(body.messages[0].content).toBe("What is 2+2?");

    vi.unstubAllGlobals();
  });

  it("resolves key from env var", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-from-env";

    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "ok" }],
      }),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const api = makeApi();
    const provider = createAnthropicProvider(api, {});
    await provider.call("sys", "user");

    const headers = (fetch as any).mock.calls[0][1].headers;
    expect(headers["x-api-key"]).toBe("sk-from-env");

    vi.unstubAllGlobals();
  });

  it("throws on API error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue("Unauthorized"),
      }),
    );

    const api = makeApi();
    const provider = createAnthropicProvider(api, { anthropicApiKey: "bad-key" });
    await expect(provider.call("sys", "user")).rejects.toThrow("Anthropic API error (401)");

    vi.unstubAllGlobals();
  });
});
