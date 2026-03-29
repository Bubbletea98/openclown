/**
 * OpenClown — Multi-perspective AI task evaluation circus for OpenClaw.
 */

import { handleAgentEnd } from "./hooks/agent-end.js";
import { handleInboundClaim } from "./hooks/inbound-claim.js";
import { handleMessagePreprocessed } from "./hooks/message-preprocessed.js";
import { handleMessageSending } from "./hooks/message-sending.js";
import { handleClownCommand } from "./commands/clown.js";
import { createLlmCaller } from "./providers/index.js";

type PluginApi = {
  id: string;
  runtime: {
    subagent: {
      run: (params: Record<string, unknown>) => Promise<{ runId: string }>;
      waitForRun: (params: Record<string, unknown>) => Promise<{ status: string; error?: string }>;
      getSessionMessages: (params: Record<string, unknown>) => Promise<{ messages: unknown[] }>;
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
    const llmCall = createLlmCaller(api.runtime.subagent, logger, api.pluginConfig);

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

    // --- Typed hooks (api.on) ---
    // These register to registry.typedHooks, dispatched via runVoidHook/runClaimingHook

    // Cache session messages when agent run completes
    api.on("agent_end", (event: unknown) => {
      const e = event as { messages: unknown[]; success: boolean };
      handleAgentEnd(e, logger);
    });

    // Detect reply + /clown via typed hook (works for plugin-bound conversations)
    api.on("inbound_claim", (event: unknown) => {
      const e = event as {
        content: string;
        body?: string;
        bodyForAgent?: string;
        channel: string;
        senderId?: string;
      };
      handleInboundClaim(e, logger);
    });

    // Tag outbound messages with reference numbers
    api.on("message_sending", (event: unknown) => {
      const e = event as {
        to: string;
        content: string;
        metadata?: Record<string, unknown>;
      };
      return handleMessageSending(e, logger);
    });

    // --- Internal hooks (api.registerHook) ---
    // These register to internal hooks system, dispatched via triggerInternalHook
    // Uses event key format "type:action" (e.g., "message:preprocessed")

    // Detect reply + /clown via internal hook (fires for ALL messages)
    // This is the primary path for reply targeting — inbound_claim only fires
    // for plugin-bound conversations, but message:preprocessed fires for every message.
    // event.context.body contains the full reply context [Replying to ...]...[/Replying]
    api.registerHook(
      "message:preprocessed",
      (event: unknown) => handleMessagePreprocessed(event, logger),
      { name: "openclown-message-preprocessed" },
    );

    logger.info("OpenClown circus is ready! Use /clown to evaluate tasks 🎪");
  },
};
