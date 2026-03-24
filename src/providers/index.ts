import type { LlmProvider, ProviderName } from "./types.js";
import { createAnthropicProvider } from "./anthropic.js";
import { createOpenAIProvider } from "./openai.js";

export type { LlmProvider, ProviderName } from "./types.js";

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
  logger: {
    info: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
  };
};

/**
 * Create an LLM provider based on plugin config.
 *
 * Reads `provider` from config (default: "anthropic") and returns
 * the appropriate provider implementation.
 */
export function createProvider(
  api: PluginApi,
  pluginConfig: Record<string, unknown> | undefined,
): LlmProvider {
  const providerName = ((pluginConfig?.provider as string) || "anthropic") as ProviderName;

  api.logger.info(`LLM provider: ${providerName}`);

  switch (providerName) {
    case "anthropic":
      return createAnthropicProvider(api, pluginConfig);

    case "openai":
      return createOpenAIProvider(api.logger, pluginConfig);

    default:
      api.logger.warn(`Unknown provider "${providerName}", falling back to anthropic`);
      return createAnthropicProvider(api, pluginConfig);
  }
}
