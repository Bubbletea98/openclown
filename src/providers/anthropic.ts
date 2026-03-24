import type { LlmProvider } from "./types.js";

type Logger = {
  info: (msg: string, ...args: unknown[]) => void;
};

type PluginApi = {
  runtime: {
    modelAuth: {
      resolveApiKeyForProvider: (params: {
        provider: string;
        cfg: Record<string, unknown>;
      }) => Promise<{ apiKey?: string } | null>;
    };
  };
  config: Record<string, unknown>;
  logger: Logger;
};

/**
 * Create an Anthropic Messages API provider.
 *
 * API key resolution order:
 * 1. pluginConfig.anthropicApiKey
 * 2. ANTHROPIC_API_KEY env var
 * 3. OpenClaw runtime auth
 */
export function createAnthropicProvider(
  api: PluginApi,
  pluginConfig: Record<string, unknown> | undefined,
): LlmProvider {
  const model = (pluginConfig?.model as string) || "claude-sonnet-4-6";

  return {
    name: "anthropic",
    async call(systemPrompt: string, userPrompt: string): Promise<string> {
      const apiKey = await resolveApiKey(api, pluginConfig);

      api.logger.info("LLM call: calling Anthropic API...");

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errorText.slice(0, 200)}`);
      }

      const result = (await response.json()) as {
        content: Array<{ type: string; text?: string }>;
      };

      const text = result.content
        ?.filter((block) => block.type === "text" && block.text)
        .map((block) => block.text)
        .join("\n");

      if (!text) {
        throw new Error("Empty response from Anthropic API");
      }

      api.logger.info(`LLM call: got ${text.length} chars response`);
      return text;
    },
  };
}

async function resolveApiKey(
  api: PluginApi,
  pluginConfig: Record<string, unknown> | undefined,
): Promise<string> {
  // 1. Plugin config
  let apiKey = pluginConfig?.anthropicApiKey as string | undefined;

  // 2. Environment variable
  if (!apiKey) {
    apiKey = process.env.ANTHROPIC_API_KEY;
  }

  // 3. Runtime auth (may not work in command context)
  if (!apiKey) {
    try {
      const auth = await api.runtime.modelAuth.resolveApiKeyForProvider({
        provider: "anthropic",
        cfg: api.config,
      });
      apiKey = auth?.apiKey;
    } catch {
      // Not available in command context
    }
  }

  if (!apiKey) {
    throw new Error(
      "No Anthropic API key found. Set one of:\n" +
        "  1. Environment variable: export ANTHROPIC_API_KEY=sk-...\n" +
        "  2. Plugin config: openclaw config set plugins.entries.openclown.config.anthropicApiKey sk-...",
    );
  }

  return apiKey;
}
