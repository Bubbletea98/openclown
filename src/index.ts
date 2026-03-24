/**
 * OpenClown — Multi-perspective AI task evaluation circus for OpenClaw.
 */

import { handleAgentEnd } from "./hooks/agent-end.js";
import { handleInboundClaim } from "./hooks/inbound-claim.js";
import { handleMessageSending } from "./hooks/message-sending.js";
import { handleClownCommand } from "./commands/clown.js";
import { createProvider } from "./providers/index.js";

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
    opts?: { priority?: number; name?: string },
  ) => void;
  on: (
    hookName: string,
    handler: (...args: unknown[]) => unknown,
    opts?: { priority?: number; name?: string },
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

export default {
  id: "openclown",
  name: "OpenClown",
  description: "Multi-perspective AI task evaluation circus",

  register(api: PluginApi) {
    const logger = api.logger;
    const provider = createProvider(api, api.pluginConfig);
    const llmCall = provider.call;

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
