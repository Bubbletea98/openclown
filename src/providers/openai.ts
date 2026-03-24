import type { LlmProvider } from "./types.js";

type Logger = {
  info: (msg: string, ...args: unknown[]) => void;
};

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o";

/**
 * Create an OpenAI Chat Completions API provider.
 *
 * Also works with any OpenAI-compatible service (Groq, Together, Mistral,
 * Ollama, LM Studio, etc.) via the `baseUrl` config option.
 *
 * API key resolution order:
 * 1. pluginConfig.openaiApiKey
 * 2. OPENAI_API_KEY env var
 */
export function createOpenAIProvider(
  logger: Logger,
  pluginConfig: Record<string, unknown> | undefined,
): LlmProvider {
  const model = (pluginConfig?.model as string) || DEFAULT_MODEL;
  const baseUrl = ((pluginConfig?.baseUrl as string) || DEFAULT_BASE_URL).replace(/\/+$/, "");

  return {
    name: "openai",
    async call(systemPrompt: string, userPrompt: string): Promise<string> {
      const apiKey = resolveApiKey(pluginConfig, baseUrl);

      logger.info(`LLM call: calling OpenAI-compatible API at ${baseUrl}...`);

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorText.slice(0, 200)}`);
      }

      const result = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };

      const text = result.choices?.[0]?.message?.content;

      if (!text) {
        throw new Error("Empty response from OpenAI-compatible API");
      }

      logger.info(`LLM call: got ${text.length} chars response`);
      return text;
    },
  };
}

function resolveApiKey(
  pluginConfig: Record<string, unknown> | undefined,
  baseUrl: string,
): string {
  // 1. Plugin config
  let apiKey = pluginConfig?.openaiApiKey as string | undefined;

  // 2. Environment variable
  if (!apiKey) {
    apiKey = process.env.OPENAI_API_KEY;
  }

  // Local endpoints (Ollama, LM Studio) typically don't need a key
  if (!apiKey && isLocalEndpoint(baseUrl)) {
    return "no-key-needed";
  }

  if (!apiKey) {
    throw new Error(
      "No OpenAI API key found. Set one of:\n" +
        "  1. Environment variable: export OPENAI_API_KEY=sk-...\n" +
        "  2. Plugin config: openclaw config set plugins.entries.openclown.config.openaiApiKey sk-...",
    );
  }

  return apiKey;
}

function isLocalEndpoint(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}
