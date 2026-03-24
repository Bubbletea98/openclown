/**
 * OpenClown — Multi-perspective AI task evaluation circus for OpenClaw.
 */

import { handleAgentEnd } from "./hooks/agent-end.js";
import { handleInboundClaim } from "./hooks/inbound-claim.js";
import { handleMessageSending } from "./hooks/message-sending.js";
import { handleClownCommand } from "./commands/clown.js";

type PluginApi = {
  id: string;
  runtime: {
    subagent: {
      run: (params: Record<string, unknown>) => Promise<{ runId: string }>;
      waitForRun: (params: Record<string, unknown>) => Promise<{ messages?: unknown[] }>;
    };
    modelAuth: {
      resolveApiKeyForProvider: (params: {
        provider: string;
        cfg: Record<string, unknown>;
      }) => Promise<{ apiKey?: string } | null>;
    };
  };
  registerCommand: (command: {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    requireAuth?: boolean;
    handler: (ctx: Record<string, unknown>) => Promise<{ text: string }> | { text: string };
  }) => void;
  registerHook: (
    events: string | string[],
    handler: (...args: unknown[]) => unknown,
    opts?: { priority?: number },
  ) => void;
  on: (
    hookName: string,
    handler: (...args: unknown[]) => unknown,
    opts?: { priority?: number },
  ) => void;
  pluginConfig?: Record<string, unknown>;
  config: Record<string, unknown>;
  logger: {
    info: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
    error: (msg: string, ...args: unknown[]) => void;
    debug: (msg: string, ...args: unknown[]) => void;
  };
};

function createLlmCaller(api: PluginApi, pluginConfig: Record<string, unknown> | undefined) {
  return async (systemPrompt: string, userPrompt: string): Promise<string> => {
    api.logger.info("LLM call: resolving API key...");

    // Read API key from plugin config, then env var, then runtime auth
    let apiKey: string | undefined;

    // 1. Plugin config (set via: openclaw config set plugins.entries.openclown.config.anthropicApiKey <key>)
    apiKey = pluginConfig?.anthropicApiKey as string | undefined;

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
        "  2. Plugin config: openclaw config set plugins.entries.openclown.config.anthropicApiKey sk-..."
      );
    }

    api.logger.info("LLM call: calling Anthropic API directly...");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: (pluginConfig?.model as string) || "claude-sonnet-4-6",
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
  };
}

export default {
  id: "openclown",
  name: "OpenClown",
  description: "Multi-perspective AI task evaluation circus",

  register(api: PluginApi) {
    const logger = api.logger;
    const llmCall = createLlmCaller(api, api.pluginConfig);

    logger.info("OpenClown circus is setting up 🎪");

    // Register /clown command
    api.registerCommand({
      name: "clown",
      description: "Evaluate the last AI task from multiple expert perspectives",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => {
        return handleClownCommand(
          {
            senderId: ctx.senderId as string | undefined,
            channel: ctx.channel as string,
            args: ctx.args as string | undefined,
          },
          llmCall,
          logger,
        );
      },
    });

    // Cache session messages when agent run completes
    api.registerHook(
      "agent_end",
      (event: unknown) => {
        const e = event as { messages: unknown[]; success: boolean };
        handleAgentEnd(e, logger);
      },
      { name: "openclown-agent-end" },
    );

    // Detect reply + /clown — extract ref number from quoted text
    api.registerHook(
      "inbound_claim",
      (event: unknown) => {
        const e = event as {
          content: string;
          body?: string;
          bodyForAgent?: string;
          channel: string;
          senderId?: string;
        };
        handleInboundClaim(e, logger);
      },
      { name: "openclown-inbound-claim" },
    );

    // Tag outbound messages with reference numbers
    api.registerHook(
      "message_sending",
      (event: unknown) => {
        const e = event as {
          to: string;
          content: string;
          metadata?: Record<string, unknown>;
        };
        return handleMessageSending(e, logger);
      },
      { name: "openclown-message-sending" },
    );

    logger.info("OpenClown circus is ready! Use /clown to evaluate tasks 🎪");
  },
};
