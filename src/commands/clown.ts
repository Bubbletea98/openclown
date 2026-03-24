import {
  consumeReplyTarget,
  findExchangeByRef,
  findExchangeByKeyword,
  getLatestExchange,
  getExchangesBefore,
  type CachedExchange,
} from "../transcript/cache.js";
import { loadLatestSessionFromDisk } from "../transcript/reader.js";
import {
  ALL_PERFORMERS,
  getActiveCircus,
  enablePerformers,
  disablePerformers,
  togglePerformer,
  resetCircus,
  isPerformerEnabled,
  detectLanguage,
  setDetectedLanguage,
  refreshPerformerNames,
} from "../circus/defaults.js";
import { createSerialEngine, type LlmCaller } from "../circus/engine.js";
import { formatEvaluation } from "../output/formatter.js";
import type { EvaluationResult } from "../circus/types.js";

type CommandContext = {
  senderId?: string;
  channel: string;
  args?: string;
};

type CommandResult = {
  text: string;
};

type Logger = {
  info: (msg: string) => void;
  debug: (msg: string) => void;
};

const DEFAULT_MAX_TRANSCRIPT_TOKENS = 4000;
const CONVERSATION_HISTORY_COUNT = 3;

// Store last evaluation + exchange + history for encore
let lastEvaluation: EvaluationResult | null = null;
let lastExchange: CachedExchange | null = null;
let lastPriorExchanges: CachedExchange[] = [];

/**
 * Handle the /clown command.
 *
 * Resolution order:
 * 1. Check temp cache for reply target (set by inbound_claim hook)
 * 2. If args start with #N, use explicit reference number
 * 3. If args contain text, fuzzy search by keyword
 * 4. Otherwise, use the latest exchange
 */
export async function handleClownCommand(
  ctx: CommandContext,
  llmCall: LlmCaller,
  logger: Logger,
): Promise<CommandResult> {
  const args = (ctx.args ?? "").trim();

  logger.info(`/clown handler: args="${args}", channel=${ctx.channel}, sender=${ctx.senderId}`);

  // Sub-commands
  if (args.startsWith("circus")) {
    return handleCircusSubcommand(args.slice(6).trim());
  }

  if (args === "encore" || args.startsWith("encore ")) {
    return handleEncore(llmCall, logger);
  }

  if (args.startsWith("chat")) {
    return { text: "🎪 Chat with a performer is coming in Phase 2. Stay tuned!" };
  }

  if (args === "help") {
    return {
      text: [
        "🎪 OpenClown Commands",
        "━━━━━━━━━━━━━━━━━━━━━━",
        "",
        "/clown — evaluate the last AI task",
        "/clown #N — evaluate a specific response by number",
        "/clown <keyword> — search and evaluate by keyword",
        "/clown circus — manage your performer lineup",
        "/clown circus add <id> — enable a performer",
        "/clown circus remove <id> — disable a performer",
        "/clown circus reset — restore defaults",
        "/clown help — show this message",
        "",
        "/clown encore — re-run task with circus feedback applied",
        "",
        "Coming soon:",
        "/clown chat <id> — chat with a performer",
      ].join("\n"),
    };
  }

  // 1. Try reply target (from inbound_claim hook)
  let exchange: CachedExchange | undefined;
  const replyKey = `${ctx.channel}:${ctx.senderId ?? "unknown"}`;
  const replyRef = consumeReplyTarget(replyKey);

  if (replyRef !== undefined) {
    logger.info(`/clown: reply target found: #${replyRef}`);
    exchange = findExchangeByRef(replyRef);
  }

  // 2. Explicit reference: /clown #3
  if (!exchange && args.startsWith("#")) {
    const refNum = parseInt(args.slice(1), 10);
    if (!isNaN(refNum)) {
      exchange = findExchangeByRef(refNum);
      if (!exchange) {
        return { text: `🎪 No cached message found for #${refNum}. It may have expired (30min TTL).` };
      }
    }
  }

  // 3. Keyword search: /clown 餐厅
  if (!exchange && args && !args.startsWith("#")) {
    exchange = findExchangeByKeyword(args);
    if (!exchange) {
      return { text: `🎪 No cached message matching "${args}". Try /clown to evaluate the last response.` };
    }
  }

  // 4. Default: latest exchange (try cache first, then load from disk)
  if (!exchange) {
    exchange = getLatestExchange();
    if (!exchange) {
      logger.info("/clown: cache empty, loading from session transcript files...");
      loadLatestSessionFromDisk(logger);
      exchange = getLatestExchange();
    }
    logger.info(`/clown: using latest exchange: ${exchange ? `#${exchange.refNum}` : "none"}`);
  }

  if (!exchange) {
    return {
      text: "🎪 No recent OpenClaw task found to evaluate. Send a task first, then use /clown to evaluate it.",
    };
  }

  // Detect language from user request and refresh performer names
  const lang = detectLanguage(exchange.userRequest);
  setDetectedLanguage(lang);
  refreshPerformerNames();
  logger.info(`/clown: detected language="${lang}", evaluating exchange #${exchange.refNum}: "${exchange.userRequest.slice(0, 60)}"`);

  // Fetch prior exchanges for conversation context
  const priorExchanges = getExchangesBefore(exchange.refNum, CONVERSATION_HISTORY_COUNT);
  logger.info(`/clown: including ${priorExchanges.length} prior exchanges for context`);

  // Run evaluation
  const engine = createSerialEngine(llmCall, DEFAULT_MAX_TRANSCRIPT_TOKENS);

  try {
    const result = await engine.evaluate(exchange, getActiveCircus(), priorExchanges);
    // Store for encore
    lastEvaluation = result;
    lastExchange = exchange;
    lastPriorExchanges = priorExchanges;
    return { text: formatEvaluation(result) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.info(`/clown: evaluation failed: ${message}`);
    return { text: `🎪 Evaluation failed: ${message}` };
  }
}

/**
 * Handle /clown encore — re-run the original task with circus feedback injected.
 *
 * Takes the last evaluation's feedback from all performers and asks the LLM
 * to re-answer the original question, addressing the feedback.
 */
async function handleEncore(
  llmCall: LlmCaller,
  logger: Logger,
): Promise<CommandResult> {
  if (!lastEvaluation || !lastExchange) {
    return {
      text: "🎪 No previous evaluation to encore. Run /clown first, then /clown encore.",
    };
  }

  logger.info(`/clown encore: re-running "${lastExchange.userRequest.slice(0, 60)}" with feedback`);

  // Build feedback summary from the last evaluation
  const feedbackLines = lastEvaluation.evaluations.map(
    (e) => `[${e.performer.emoji} ${e.performer.name}]: ${e.content}`,
  );
  const feedbackBlock = feedbackLines.join("\n\n");

  // Build conversation history for context
  const historyBlock =
    lastPriorExchanges.length > 0
      ? `## Conversation History\n(Prior exchanges for context)\n\n${lastPriorExchanges
          .map((ex) => {
            const response =
              ex.assistantResponse.length > 200
                ? ex.assistantResponse.slice(0, 200) + "..."
                : ex.assistantResponse;
            return `User: ${ex.userRequest}\nAssistant: ${response}`;
          })
          .join("\n\n")}\n\n`
      : "";

  const systemPrompt = `You are a helpful AI assistant. You previously answered a user's question, but a review panel found issues with your response. Their feedback is provided below.

Re-answer the user's original question, addressing the feedback. Improve your response based on the specific concerns raised. Do NOT mention the review panel or the feedback process — just give a better answer.

${historyBlock}## Review Panel Feedback on Your Previous Response

${feedbackBlock}

## Your Previous Response (for reference)

${lastExchange.assistantResponse}`;

  const userPrompt = lastExchange.userRequest;

  try {
    const improvedResponse = await llmCall(systemPrompt, userPrompt);

    const lines = [
      "🎪 Encore — Improved Response",
      "━━━━━━━━━━━━━━━━━━━━━━",
      "",
      `📋 Original question: "${lastEvaluation.targetSummary}"`,
      "",
      improvedResponse,
      "",
      "━━━━━━━━━━━━━━━━━━━━━━",
      "This response was regenerated with circus feedback applied.",
      "Run /clown to evaluate again, or /clown encore for another round.",
    ];

    // Update the exchange's assistant response for potential re-evaluation
    lastExchange = {
      ...lastExchange,
      assistantResponse: improvedResponse,
    };
    lastEvaluation = null; // Clear so next encore requires a fresh /clown

    return { text: lines.join("\n") };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.info(`/clown encore: failed: ${message}`);
    return { text: `🎪 Encore failed: ${message}` };
  }
}

/**
 * Handle /clown circus sub-commands.
 *
 * /clown circus                            — numbered list with ✅/⬜
 * /clown circus add <id> [id2] [id3]       — enable one or more
 * /clown circus remove <id> [id2] [id3]    — disable one or more
 * /clown circus toggle 1,3,5               — toggle by number from list
 * /clown circus reset                      — restore defaults
 */
function handleCircusSubcommand(args: string): CommandResult {
  const parts = args.trim().split(/\s+/);
  const subCmd = parts[0] ?? "";
  const targets = parts.slice(1);

  // /clown circus — numbered list with checkmarks
  if (!subCmd || subCmd === "list") {
    const lines = ["🎪 Circus Performers", "━━━━━━━━━━━━━━━━━━━━━━", ""];
    ALL_PERFORMERS.forEach((p, i) => {
      const num = i + 1;
      const check = isPerformerEnabled(p.id) ? "✅" : "⬜";
      lines.push(`${check} ${num}. ${p.emoji} ${p.name}  [${p.id}]`);
    });
    lines.push("");
    lines.push("━━━━━━━━━━━━━━━━━━━━━━");
    lines.push("Quick toggle by number:");
    lines.push("  /clown circus toggle 1,4,7");
    lines.push("");
    lines.push("By name (multiple ok):");
    lines.push("  /clown circus add comedian grandparents");
    lines.push("  /clown circus remove philosopher security");
    lines.push("");
    lines.push("/clown circus reset — restore defaults");
    return { text: lines.join("\n") };
  }

  // /clown circus toggle 1,3,5
  if (subCmd === "toggle") {
    const numStr = targets.join(",");
    const nums = numStr.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));

    if (nums.length === 0) {
      return { text: "🎪 Usage: /clown circus toggle 1,3,5\nUse /clown circus to see numbers." };
    }

    const results: string[] = [];
    for (const num of nums) {
      const idx = num - 1;
      if (idx < 0 || idx >= ALL_PERFORMERS.length) {
        results.push(`❌ #${num} — invalid number`);
        continue;
      }
      const p = ALL_PERFORMERS[idx];
      const { enabled, success } = togglePerformer(p.id);
      if (success) {
        results.push(`${enabled ? "✅" : "⬜"} ${p.emoji} ${p.name}`);
      } else {
        results.push(`❌ ${p.emoji} ${p.name} — can't remove last performer`);
      }
    }

    return { text: `🎪 Toggled:\n${results.join("\n")}` };
  }

  // /clown circus add <id> [id2] [id3]
  if (subCmd === "add") {
    if (targets.length === 0) {
      return { text: "🎪 Usage: /clown circus add <id> [id2] [id3]\nUse /clown circus to see IDs." };
    }
    const added = enablePerformers(...targets);
    const unknown = targets.filter((t) => !ALL_PERFORMERS.some((p) => p.id === t));
    const already = targets.filter((t) => !added.includes(t) && !unknown.includes(t));

    const lines: string[] = [];
    for (const id of added) {
      const p = ALL_PERFORMERS.find((x) => x.id === id);
      lines.push(`✅ ${p?.emoji ?? "🎪"} ${p?.name ?? id} joined!`);
    }
    for (const id of already) {
      const p = ALL_PERFORMERS.find((x) => x.id === id);
      lines.push(`⏭️ ${p?.emoji ?? "🎪"} ${p?.name ?? id} already active`);
    }
    for (const id of unknown) {
      lines.push(`❌ "${id}" — not found`);
    }

    return { text: lines.join("\n") };
  }

  // /clown circus remove <id> [id2] [id3]
  if (subCmd === "remove") {
    if (targets.length === 0) {
      return { text: "🎪 Usage: /clown circus remove <id> [id2] [id3]\nUse /clown circus to see IDs." };
    }
    const removed = disablePerformers(...targets);
    const notActive = targets.filter((t) => !removed.includes(t));

    const lines: string[] = [];
    for (const id of removed) {
      const p = ALL_PERFORMERS.find((x) => x.id === id);
      lines.push(`⬜ ${p?.emoji ?? "🎪"} ${p?.name ?? id} left the circus`);
    }
    for (const id of notActive) {
      if (isPerformerEnabled(id)) {
        lines.push(`❌ ${id} — can't remove, need at least 1 performer`);
      } else {
        lines.push(`⏭️ ${id} — was not active`);
      }
    }

    return { text: lines.join("\n") };
  }

  // /clown circus reset
  if (subCmd === "reset") {
    resetCircus();
    return { text: "🎪 Circus reset to defaults: philosopher, security, developer.\nConfig saved." };
  }

  return { text: `🎪 Unknown: /clown circus ${subCmd}\nTry: /clown circus, add, remove, toggle, reset` };
}
