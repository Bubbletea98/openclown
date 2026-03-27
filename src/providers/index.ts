/**
 * LLM provider with subagent-first, direct-API-fallback strategy.
 *
 * 1. Try OpenClaw's runtime subagent API (zero-config, uses user's existing provider)
 * 2. If subagent fails (e.g., not available in command context on some OpenClaw versions),
 *    fall back to direct API call using env vars (ANTHROPIC_API_KEY or OPENAI_API_KEY)
 */

export type LlmCaller = (systemPrompt: string, userPrompt: string) => Promise<string>;

type SubagentApi = {
  run: (params: Record<string, unknown>) => Promise<{ runId: string }>;
  waitForRun: (params: Record<string, unknown>) => Promise<{ status: string; error?: string }>;
  getSessionMessages: (params: Record<string, unknown>) => Promise<{ messages: unknown[] }>;
};

type Logger = {
  info: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
};

type PluginConfig = Record<string, unknown> | undefined;

let callCounter = 0;
let subagentAvailable: boolean | null = null; // null = unknown, will test on first call

/**
 * Create an LLM caller that tries subagent first, falls back to direct API.
 */
export function createLlmCaller(
  subagent: SubagentApi,
  logger: Logger,
  pluginConfig: PluginConfig,
): LlmCaller {
  const modelOverride = pluginConfig?.model as string | undefined;
  const providerOverride = pluginConfig?.provider as string | undefined;

  if (modelOverride || providerOverride) {
    logger.info(
      `OpenClown LLM overrides: provider=${providerOverride ?? "default"}, model=${modelOverride ?? "default"}`,
    );
  }

  return async (systemPrompt: string, userPrompt: string): Promise<string> => {
    // If we already know subagent is unavailable, skip straight to fallback
    if (subagentAvailable !== false) {
      try {
        const result = await callViaSubagent(subagent, logger, pluginConfig, systemPrompt, userPrompt);
        subagentAvailable = true;
        return result;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);

        if (msg.includes("only available during a gateway request") || msg.includes("subagent methods")) {
          subagentAvailable = false;
          logger.warn(`Subagent unavailable in this context, falling back to direct API: ${msg}`);
        } else {
          // Other errors (timeout, model error) — re-throw, don't fallback
          throw error;
        }
      }
    }

    // Fallback: direct API call
    return callDirectApi(logger, pluginConfig, systemPrompt, userPrompt);
  };
}

/**
 * Call LLM via OpenClaw subagent runtime.
 */
async function callViaSubagent(
  subagent: SubagentApi,
  logger: Logger,
  pluginConfig: PluginConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const sessionKey = `openclown-eval-${Date.now()}-${++callCounter}`;
  const modelOverride = pluginConfig?.model as string | undefined;
  const providerOverride = pluginConfig?.provider as string | undefined;

  logger.info(`LLM call: starting subagent run (session=${sessionKey})...`);

  const runParams: Record<string, unknown> = {
    sessionKey,
    idempotencyKey: sessionKey,
    message: userPrompt,
    extraSystemPrompt: systemPrompt,
    deliver: false,
  };

  if (providerOverride) runParams.provider = providerOverride;
  if (modelOverride) runParams.model = modelOverride;

  const { runId } = await subagent.run(runParams);

  const waitResult = await subagent.waitForRun({
    runId,
    timeoutMs: 60_000,
  });

  if (waitResult.status === "error") {
    throw new Error(`Subagent run failed: ${waitResult.error ?? "unknown error"}`);
  }

  if (waitResult.status === "timeout") {
    throw new Error("Subagent run timed out after 60s");
  }

  const { messages } = await subagent.getSessionMessages({
    sessionKey,
    limit: 10,
  });

  const text = extractAssistantText(messages);

  if (!text) {
    throw new Error("Empty response from OpenClaw subagent");
  }

  logger.info(`LLM call: got ${text.length} chars response (via subagent)`);
  return text;
}

/**
 * Direct API call as fallback when subagent runtime is unavailable.
 *
 * Detects available API key from env vars or plugin config:
 * - ANTHROPIC_API_KEY → Anthropic API
 * - OPENAI_API_KEY → OpenAI-compatible API
 */
async function callDirectApi(
  logger: Logger,
  pluginConfig: PluginConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  // Try Anthropic
  const anthropicKey =
    (pluginConfig?.anthropicApiKey as string | undefined) ??
    process.env.ANTHROPIC_API_KEY;

  if (anthropicKey) {
    return callAnthropicApi(logger, anthropicKey, pluginConfig, systemPrompt, userPrompt);
  }

  // Try OpenAI
  const openaiKey =
    (pluginConfig?.openaiApiKey as string | undefined) ??
    process.env.OPENAI_API_KEY;

  if (openaiKey) {
    const baseUrl = (pluginConfig?.baseUrl as string | undefined) ?? "https://api.openai.com/v1";
    return callOpenAiApi(logger, openaiKey, baseUrl, pluginConfig, systemPrompt, userPrompt);
  }

  throw new Error(
    "OpenClown could not connect to the LLM.\n" +
    "Your OpenClaw version may not support the subagent API in command context.\n\n" +
    "Workaround — set an API key directly:\n" +
    "  export ANTHROPIC_API_KEY=sk-ant-...    (or)\n" +
    "  export OPENAI_API_KEY=sk-...\n\n" +
    "Or upgrade OpenClaw to the latest version.",
  );
}

async function callAnthropicApi(
  logger: Logger,
  apiKey: string,
  pluginConfig: PluginConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const model = (pluginConfig?.model as string) || "claude-sonnet-4-6";
  logger.info(`LLM call: using direct Anthropic API (model=${model})...`);

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

  logger.info(`LLM call: got ${text.length} chars response (via Anthropic API)`);
  return text;
}

async function callOpenAiApi(
  logger: Logger,
  apiKey: string,
  baseUrl: string,
  pluginConfig: PluginConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const model = (pluginConfig?.model as string) || "gpt-4o-mini";
  logger.info(`LLM call: using direct OpenAI API (model=${model}, baseUrl=${baseUrl})...`);

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

  const text = result.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new Error("Empty response from OpenAI API");
  }

  logger.info(`LLM call: got ${text.length} chars response (via OpenAI API)`);
  return text;
}

/**
 * Extract the assistant's text content from subagent messages.
 */
function extractAssistantText(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown> | undefined;
    if (!msg) continue;

    const role = msg.role as string | undefined;
    if (role !== "assistant") continue;

    const content = msg.content;

    if (typeof content === "string") {
      return content.trim();
    }

    if (Array.isArray(content)) {
      return content
        .filter(
          (block: unknown): block is { type: string; text: string } =>
            typeof block === "object" &&
            block !== null &&
            (block as Record<string, unknown>).type === "text" &&
            typeof (block as Record<string, unknown>).text === "string",
        )
        .map((block) => block.text)
        .join("\n")
        .trim();
    }
  }

  return "";
}
