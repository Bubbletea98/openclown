import {
  consumeReplyTarget,
  consumeReplyContent,
  findExchangeByRef,
  findExchangeByContent,
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
  addCustomPerformer,
  deleteCustomPerformer,
} from "../circus/defaults.js";
import { isUserSkill, readSkillMd } from "../circus/skill-loader.js";
import { INTERVIEW_SYSTEM_PROMPT, GENERATOR_SYSTEM_PROMPT } from "../circus/generator-prompt.js";
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
 * Summarize a SKILL.md draft for mobile-friendly display.
 * Shows key fields without the full prompt body.
 */
function summarizeDraft(skillMd: string): string {
  const lines = skillMd.split("\n");

  let id = "";
  let name = "";
  let emoji = "";
  let severity = "";
  let category = "";
  const examines: string[] = [];

  let inFrontmatter = false;
  let inNames = false;
  let pastFrontmatter = false;

  for (const line of lines) {
    if (line === "---" && !inFrontmatter && !pastFrontmatter) {
      inFrontmatter = true;
      continue;
    }
    if (line === "---" && inFrontmatter) {
      inFrontmatter = false;
      pastFrontmatter = true;
      continue;
    }

    if (inFrontmatter) {
      if (inNames) {
        const m = line.match(/^\s+(\w+):\s*(.+)/);
        if (m) {
          if (!name) name = m[2].replace(/^["']|["']$/g, "");
          continue;
        }
        inNames = false;
      }
      const kv = line.match(/^(\w+):\s*(.*)/);
      if (kv) {
        const [, key, val] = kv;
        const v = val.replace(/^["']|["']$/g, "").trim();
        if (key === "id") id = v;
        else if (key === "emoji") emoji = v;
        else if (key === "severity") severity = v;
        else if (key === "category") category = v;
        else if (key === "names" && !v) inNames = true;
      }
    }

    // Collect bullet points from "What to Examine" section (max 5)
    if (pastFrontmatter && line.match(/^[-•]\s+/) && examines.length < 5) {
      examines.push(line.trim());
    }
  }

  const severityMap: Record<string, string> = {
    insight: "💡 Insight",
    warning: "⚠️ Warning",
    critical: "🔴 Critical",
  };

  const result = [
    `${emoji} ${name} [${id}]`,
    "",
    `Severity: ${severityMap[severity] ?? severity}`,
    `Category: ${category || "serious"}`,
  ];

  if (examines.length > 0) {
    result.push("", "Examines:");
    for (const e of examines) {
      result.push(`  ${e}`);
    }
  }

  return result.join("\n");
}

// Create session state
type CreateSession = {
  phase: "interview" | "draft";
  description: string;
  conversation: string[]; // accumulated context
  pendingDraft: string | null; // generated SKILL.md waiting for approval
};
let createSession: CreateSession | null = null;

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
    return handleCircusSubcommand(args.slice(6).trim(), llmCall, logger);
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
        "Evaluate:",
        "  /clown — evaluate the last AI task",
        "  /clown #N — evaluate by reference number",
        "  /clown <keyword> — search and evaluate by keyword",
        "  /clown encore — re-run task with feedback applied",
        "",
        "Circus:",
        "  /clown circus — view performer lineup",
        "  /clown circus on <id or number> — enable performer(s)",
        "  /clown circus off <id or number> — disable performer(s)",
        "  /clown circus toggle 1,3 — enable and disable in one command",
        "  /clown circus reset — restore defaults",
        "",
        "Custom performers:",
        "  /clown circus create <desc> — create (guided flow)",
        "  /clown circus edit <id> [changes] — edit existing",
        "  /clown circus delete <id> — permanently remove",
        "",
        "/clown help — show this message",
      ].join("\n"),
    };
  }

  // Always refresh cache from session files to ensure we have latest data
  // (hooks may not fire reliably in all OpenClaw versions)
  loadLatestSessionFromDisk(logger);

  // Resolution order:
  // 1. [🎪 #N] tag from reply context (exact match)
  // 2. Content matching from reply quoted text
  // 3. Explicit #N argument
  // 4. Keyword search
  // 5. Latest exchange (fallback)

  let exchange: CachedExchange | undefined;
  let matchedViaContent = false;
  const replyKey = `${ctx.channel}:${ctx.senderId ?? "unknown"}`;

  // 1. Try [🎪 #N] tag (from inbound_claim hook)
  const replyRef = consumeReplyTarget(replyKey);
  if (replyRef !== undefined) {
    logger.info(`/clown: reply target found via tag: #${replyRef}`);
    exchange = findExchangeByRef(replyRef);
  }

  // 2. Try content matching from reply quoted text
  if (!exchange && !args) {
    const quotedText = consumeReplyContent(replyKey);
    if (quotedText) {
      logger.info(`/clown: trying content match for: "${quotedText.slice(0, 80)}..."`);
      exchange = findExchangeByContent(quotedText);
      if (exchange) {
        matchedViaContent = true;
        logger.info(`/clown: content matched exchange #${exchange.refNum}`);
      } else {
        logger.info("/clown: content match failed, falling back to latest");
      }
    }
  }

  // 3. Explicit reference: /clown #3
  if (!exchange && args.startsWith("#")) {
    const refNum = parseInt(args.slice(1), 10);
    if (!isNaN(refNum)) {
      exchange = findExchangeByRef(refNum);
      if (!exchange) {
        return { text: `🎪 No cached message found for #${refNum}. It may have expired (2h TTL).` };
      }
    }
  }

  // 4. Keyword search: /clown 餐厅
  if (!exchange && args && !args.startsWith("#")) {
    exchange = findExchangeByKeyword(args);
    if (!exchange) {
      return { text: `🎪 No cached message matching "${args}". Try /clown to evaluate the last response.` };
    }
  }

  // 5. Default: latest exchange
  if (!exchange) {
    exchange = getLatestExchange();
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
    let output = formatEvaluation(result);
    if (matchedViaContent) {
      const preview = exchange.assistantResponse.slice(0, 50).replace(/\n/g, " ");
      output = `📎 Matched reply: "${preview}..."\n\n${output}`;
    }
    return { text: output };
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
      "💡 Reply with /clown — evaluate this improved answer",
      "🎪 /clown circus — manage your performers or create new ones",
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
/**
 * Resolve a list of items (numbers or ids) to performer ids.
 */
function resolvePerformerIds(items: string[]): { valid: string[]; unknown: string[] } {
  const valid: string[] = [];
  const unknown: string[] = [];
  for (const item of items) {
    const num = parseInt(item, 10);
    if (!isNaN(num)) {
      const idx = num - 1;
      if (idx >= 0 && idx < ALL_PERFORMERS.length) {
        valid.push(ALL_PERFORMERS[idx].id);
      } else {
        unknown.push(item);
      }
    } else if (ALL_PERFORMERS.some((p) => p.id === item)) {
      valid.push(item);
    } else {
      unknown.push(item);
    }
  }
  return { valid, unknown };
}

async function handleCircusSubcommand(
  args: string,
  llmCall: LlmCaller,
  logger: Logger,
): Promise<CommandResult> {
  const parts = args.trim().split(/\s+/);
  const subCmd = parts[0] ?? "";
  const targets = parts.slice(1);

  // /clown circus — numbered list with checkmarks
  if (!subCmd || subCmd === "list") {
    const lines = ["🎪 Circus Performers", "━━━━━━━━━━━━━━━━━━━━━━", "", "Toggle performers on/off using (number) or [id]:", ""];
    ALL_PERFORMERS.forEach((p, i) => {
      const num = i + 1;
      const check = isPerformerEnabled(p.id) ? "✅" : "⬜";
      const custom = isUserSkill(p.id) ? " (custom)" : "";
      lines.push(`${check} (${num}) ${p.emoji} ${p.name}  [${p.id}]${custom}`);
    });
    lines.push("");
    lines.push("━━━━━━━━━━━━━━━━━━━━━━");
    lines.push("Use id or number above for performers. Separate multiple with commas.");
    lines.push("✅ /clown circus on comedian — enable performer(s)");
    lines.push("⬜ /clown circus off philosopher — disable performer(s)");
    lines.push("🔄 /clown circus toggle 1,3 — enable & disable in one command");
    lines.push("✨ /clown circus create <description> — create your own");
    lines.push("📖 /clown help — all commands");
    return { text: lines.join("\n") };
  }

  // /clown circus toggle 1,3,5 or toggle comedian,security
  if (subCmd === "toggle") {
    const items = targets.join(",").split(",").map((s) => s.trim()).filter(Boolean);

    if (items.length === 0) {
      return { text: "🎪 Usage:\n  /clown circus toggle 1,3,5 (by number)\n  /clown circus toggle comedian,security (by id)\nUse /clown circus to see the list." };
    }

    const results: string[] = [];
    for (const item of items) {
      const num = parseInt(item, 10);

      // Try as number first
      if (!isNaN(num)) {
        const idx = num - 1;
        if (idx < 0 || idx >= ALL_PERFORMERS.length) {
          results.push(`❌ (${num}) — invalid number`);
          continue;
        }
        const p = ALL_PERFORMERS[idx];
        const { enabled, success } = togglePerformer(p.id);
        if (success) {
          results.push(`${enabled ? "✅" : "⬜"} ${p.emoji} ${p.name}`);
        } else {
          results.push(`❌ ${p.emoji} ${p.name} — can't remove last performer`);
        }
        continue;
      }

      // Try as id
      const p = ALL_PERFORMERS.find((x) => x.id === item);
      if (!p) {
        results.push(`❌ "${item}" — not found`);
        continue;
      }
      const { enabled, success } = togglePerformer(p.id);
      if (success) {
        results.push(`${enabled ? "✅" : "⬜"} ${p.emoji} ${p.name}`);
      } else {
        results.push(`❌ ${p.emoji} ${p.name} — can't remove last performer`);
      }
    }

    return { text: `🎪 Toggled:\n${results.join("\n")}` };
  }

  // /clown circus on <id|number> — enable performers
  // /clown circus add <id> — alias for on
  if (subCmd === "on" || subCmd === "add") {
    const items = targets.join(",").split(",").map((s) => s.trim()).filter(Boolean);
    if (items.length === 0) {
      return { text: "🎪 Usage: /clown circus on comedian,factchecker\nUse /clown circus to see the list." };
    }
    const ids = resolvePerformerIds(items);
    const added = enablePerformers(...ids.valid);

    const lines: string[] = [];
    for (const id of added) {
      const p = ALL_PERFORMERS.find((x) => x.id === id);
      lines.push(`✅ ${p?.emoji ?? "🎪"} ${p?.name ?? id} enabled`);
    }
    for (const id of ids.valid.filter((t) => !added.includes(t))) {
      const p = ALL_PERFORMERS.find((x) => x.id === id);
      lines.push(`⏭️ ${p?.emoji ?? "🎪"} ${p?.name ?? id} already active`);
    }
    for (const item of ids.unknown) {
      lines.push(`❌ "${item}" — not found`);
    }
    return { text: lines.join("\n") };
  }

  // /clown circus off <id|number> — disable performers
  // /clown circus remove <id> — alias for off
  if (subCmd === "off" || subCmd === "remove") {
    const items = targets.join(",").split(",").map((s) => s.trim()).filter(Boolean);
    if (items.length === 0) {
      return { text: "🎪 Usage: /clown circus off philosopher,security\nUse /clown circus to see the list." };
    }
    const ids = resolvePerformerIds(items);
    const removed = disablePerformers(...ids.valid);

    const lines: string[] = [];
    for (const id of removed) {
      const p = ALL_PERFORMERS.find((x) => x.id === id);
      lines.push(`⬜ ${p?.emoji ?? "🎪"} ${p?.name ?? id} disabled`);
    }
    for (const id of ids.valid.filter((t) => !removed.includes(t))) {
      if (isPerformerEnabled(id)) {
        lines.push(`❌ ${id} — can't remove last performer`);
      } else {
        lines.push(`⏭️ ${id} — already inactive`);
      }
    }
    for (const item of ids.unknown) {
      lines.push(`❌ "${item}" — not found`);
    }
    return { text: lines.join("\n") };
  }

  // /clown circus reset
  if (subCmd === "reset") {
    resetCircus();
    return { text: "🎪 Circus reset to defaults: philosopher, security, developer.\nConfig saved." };
  }

  // /clown circus create <description or reply>
  if (subCmd === "create") {
    const input = targets.join(" ").trim();

    // No input and no active session → show usage
    if (!input && !createSession) {
      return {
        text: [
          "🎪 Usage: /clown circus create <description>",
          "",
          "Example:",
          "/clown circus create A maritime law expert who evaluates responses for legal accuracy around shipping regulations",
          "",
          "I'll ask a few follow-up questions before generating the performer.",
        ].join("\n"),
      };
    }

    try {
      // Phase 1: New session — ask follow-up questions
      if (!createSession) {
        logger.info(`/clown circus create: starting interview for "${input.slice(0, 60)}..."`);

        const questions = await llmCall(
          INTERVIEW_SYSTEM_PROMPT,
          `User wants to create this evaluator:\n\n${input}`,
        );

        createSession = {
          phase: "interview",
          description: input,
          conversation: [input],
          pendingDraft: null,
        };

        return {
          text: [
            "🎪 Creating a new performer...",
            "",
            questions,
            "",
            "━━━━━━━━━━━━━━━━━━━━━━",
            "Reply with /clown circus create <your answers>",
            "Or /clown circus cancel to abort.",
          ].join("\n"),
        };
      }

      // Phase 2: User answered questions → generate draft
      if (createSession.phase === "interview") {
        logger.info(`/clown circus create: generating draft from answers`);

        createSession.conversation.push(input);
        createSession.phase = "draft";

        const fullContext = [
          `Original description: ${createSession.description}`,
          "",
          `Follow-up answers: ${input}`,
        ].join("\n");

        const skillMd = await llmCall(GENERATOR_SYSTEM_PROMPT, fullContext);

        const cleaned = skillMd
          .replace(/^```(?:markdown|md)?\s*\n?/m, "")
          .replace(/\n?```\s*$/m, "")
          .trim();

        createSession.pendingDraft = cleaned;

        return {
          text: [
            "🎪 Performer draft:",
            "",
            summarizeDraft(cleaned),
            "",
            "━━━━━━━━━━━━━━━━━━━━━━",
            "/clown circus confirm — save and enable",
            "/clown circus preview — see full definition",
            "/clown circus create <changes> — request changes",
            "/clown circus cancel — discard",
          ].join("\n"),
        };
      }

      // Phase 3: User wants changes to draft → regenerate
      if (createSession.phase === "draft") {
        logger.info(`/clown circus create: regenerating draft with changes`);

        createSession.conversation.push(input);

        const fullContext = [
          `Original description: ${createSession.description}`,
          "",
          `Previous conversation: ${createSession.conversation.slice(1, -1).join("\n")}`,
          "",
          `User's requested changes: ${input}`,
          "",
          `Previous draft that needs changes:\n${createSession.pendingDraft}`,
        ].join("\n");

        const skillMd = await llmCall(GENERATOR_SYSTEM_PROMPT, fullContext);

        const cleaned = skillMd
          .replace(/^```(?:markdown|md)?\s*\n?/m, "")
          .replace(/\n?```\s*$/m, "")
          .trim();

        createSession.pendingDraft = cleaned;

        return {
          text: [
            "🎪 Updated draft:",
            "",
            summarizeDraft(cleaned),
            "",
            "━━━━━━━━━━━━━━━━━━━━━━",
            "/clown circus confirm — save and enable",
            "/clown circus preview — see full definition",
            "/clown circus create <more changes> — revise again",
            "/clown circus cancel — discard",
          ].join("\n"),
        };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.info(`/clown circus create: failed: ${msg}`);
      createSession = null;
      return { text: `🎪 Failed: ${msg}` };
    }
  }

  // /clown circus confirm — save the pending draft
  if (subCmd === "confirm") {
    if (!createSession?.pendingDraft) {
      return { text: "🎪 Nothing to confirm. Start with /clown circus create <description>." };
    }

    const performer = addCustomPerformer(createSession.pendingDraft);
    createSession = null;

    if (!performer) {
      return {
        text: "🎪 Failed to save — the draft was invalid or the ID conflicts with a built-in performer. Try /clown circus create again.",
      };
    }

    return {
      text: [
        "🎪 New Performer Created!",
        `${performer.emoji} ${performer.name} [${performer.id}]`,
        "",
        "✅ Saved and enabled.",
        `Use /clown circus remove ${performer.id} to disable.`,
        `Use /clown circus delete ${performer.id} to permanently remove.`,
      ].join("\n"),
    };
  }

  // /clown circus preview — show full pending draft
  if (subCmd === "preview") {
    if (!createSession?.pendingDraft) {
      return { text: "🎪 Nothing to preview. Start with /clown circus create or /clown circus edit." };
    }
    return {
      text: [
        "🎪 Full definition:",
        "",
        createSession.pendingDraft,
      ].join("\n"),
    };
  }

  // /clown circus cancel — discard create session
  if (subCmd === "cancel") {
    if (!createSession) {
      return { text: "🎪 Nothing to cancel." };
    }
    createSession = null;
    return { text: "🎪 Performer creation cancelled." };
  }

  // /clown circus edit <id> [changes]
  if (subCmd === "edit") {
    const id = targets[0];
    const changes = targets.slice(1).join(" ").trim();

    if (!id) {
      return { text: "🎪 Usage: /clown circus edit <id> [what to change]\n\nExample:\n/clown circus edit philosopher Make it focus more on ethical assumptions" };
    }

    const performer = ALL_PERFORMERS.find((p) => p.id === id);
    if (!performer) {
      return { text: `🎪 Performer "${id}" not found. Use /clown circus to see all performers.` };
    }

    const currentSkillMd = readSkillMd(id);
    if (!currentSkillMd) {
      return { text: `🎪 Could not read SKILL.md for "${id}".` };
    }

    // If no changes specified, show current and ask what to change
    if (!changes) {
      createSession = {
        phase: "draft",
        description: `Editing existing performer: ${performer.name} [${id}]`,
        conversation: [],
        pendingDraft: currentSkillMd,
      };

      return {
        text: [
          `🎪 Editing ${performer.emoji} ${performer.name} [${id}]`,
          "",
          "Current definition:",
          "━━━━━━━━━━━━━━━━━━━━━━",
          currentSkillMd,
          "━━━━━━━━━━━━━━━━━━━━━━",
          "",
          "Reply with what you'd like to change:",
          `  /clown circus edit ${id} <what to change>`,
        ].join("\n"),
      };
    }

    // Generate updated draft
    try {
      logger.info(`/clown circus edit: updating ${id} with "${changes.slice(0, 60)}..."`);

      const editContext = [
        `Current SKILL.md for performer "${performer.name}":\n${currentSkillMd}`,
        "",
        `User's requested changes: ${changes}`,
        "",
        "Generate the updated SKILL.md with these changes applied. Keep the same id.",
      ].join("\n");

      const skillMd = await llmCall(GENERATOR_SYSTEM_PROMPT, editContext);

      const cleaned = skillMd
        .replace(/^```(?:markdown|md)?\s*\n?/m, "")
        .replace(/\n?```\s*$/m, "")
        .trim();

      createSession = {
        phase: "draft",
        description: `Editing performer: ${performer.name} [${id}]`,
        conversation: [changes],
        pendingDraft: cleaned,
      };

      return {
        text: [
          `🎪 Updated draft for ${performer.emoji} ${performer.name}:`,
          "",
          summarizeDraft(cleaned),
          "",
          "━━━━━━━━━━━━━━━━━━━━━━",
          "/clown circus confirm — save changes",
          "/clown circus preview — see full definition",
          `/clown circus edit ${id} <more changes> — revise again`,
          "/clown circus cancel — discard changes",
        ].join("\n"),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.info(`/clown circus edit: failed: ${msg}`);
      return { text: `🎪 Failed to edit: ${msg}` };
    }
  }

  // /clown circus delete <id>
  if (subCmd === "delete") {
    const id = targets[0];
    if (!id) {
      return { text: "🎪 Usage: /clown circus delete <id>\nOnly custom performers can be deleted." };
    }

    const performer = ALL_PERFORMERS.find((p) => p.id === id);
    const result = deleteCustomPerformer(id);

    if (!result.success) {
      if (result.reason === "builtin") {
        return {
          text: `🎪 Can't delete built-in performer "${id}". Use /clown circus remove ${id} to disable it instead.`,
        };
      }
      return { text: `🎪 Custom performer "${id}" not found. Use /clown circus to see all performers.` };
    }

    return {
      text: `🗑️ ${performer?.emoji ?? "🎪"} ${performer?.name ?? id} permanently removed.`,
    };
  }

  return { text: `🎪 Unknown: /clown circus ${subCmd}\nTry: /clown circus, on, off, toggle, create, edit, delete, reset` };
}
