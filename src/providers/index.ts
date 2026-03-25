/**
 * LLM provider that delegates to OpenClaw's runtime subagent API.
 *
 * This means OpenClown automatically uses whatever LLM provider the user
 * already configured in OpenClaw — no separate API keys or provider config needed.
 * Users can optionally override the provider/model for OpenClown evaluations.
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

/**
 * Create an LLM caller that uses OpenClaw's subagent runtime.
 *
 * The subagent API routes through OpenClaw's model layer, so it automatically
 * handles provider selection, API keys, rate limiting, and model fallbacks.
 *
 * Each call gets a unique sessionKey so parallel performer evaluations
 * don't interfere with each other.
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
    const sessionKey = `openclown-eval-${Date.now()}-${++callCounter}`;

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

    // 1. Start the run
    const { runId } = await subagent.run(runParams);

    // 2. Wait for completion
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

    // 3. Read the response messages
    const { messages } = await subagent.getSessionMessages({
      sessionKey,
      limit: 10,
    });

    const text = extractAssistantText(messages);

    if (!text) {
      throw new Error("Empty response from OpenClaw subagent");
    }

    logger.info(`LLM call: got ${text.length} chars response`);
    return text;
  };
}

/**
 * Extract the assistant's text content from subagent messages.
 */
function extractAssistantText(messages: unknown[]): string {
  // Walk messages in reverse to find the last assistant message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown> | undefined;
    if (!msg) continue;

    const role = msg.role as string | undefined;
    if (role !== "assistant") continue;

    // Content can be a string or an array of blocks
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
