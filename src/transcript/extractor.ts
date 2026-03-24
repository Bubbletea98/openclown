import type { CachedExchange, CachedMessage } from "./cache.js";

/**
 * Extract text content from a message's content field.
 * Handles both string content and array-of-blocks content.
 */
export function extractTextContent(content: unknown): string {
  let text: string;
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .filter((block): block is { type: string; text: string } =>
        typeof block === "object" && block !== null && "text" in block,
      )
      .map((block) => block.text)
      .join("\n");
  } else {
    text = String(content ?? "");
  }
  return stripMetadata(text);
}

/**
 * Extract detailed execution info from assistant message content blocks.
 * Captures thinking process, tool calls (with arguments), and text responses.
 */
export function extractExecutionDetails(content: unknown): {
  thinking: string[];
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
  text: string;
} {
  const result = {
    thinking: [] as string[],
    toolCalls: [] as Array<{ name: string; arguments: Record<string, unknown> }>,
    text: "",
  };

  if (!Array.isArray(content)) {
    result.text = extractTextContent(content);
    return result;
  }

  const textParts: string[] = [];

  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const b = block as Record<string, unknown>;

    switch (b.type) {
      case "thinking":
        if (typeof b.text === "string" && b.text.trim()) {
          result.thinking.push(b.text.trim());
        }
        break;
      case "toolCall":
        result.toolCalls.push({
          name: (b.name as string) ?? "unknown",
          arguments: (b.arguments as Record<string, unknown>) ?? {},
        });
        break;
      case "text":
        if (typeof b.text === "string") {
          textParts.push(b.text);
        }
        break;
    }
  }

  result.text = stripMetadata(textParts.join("\n"));
  return result;
}

/**
 * Strip OpenClaw metadata prefixes from message text.
 */
function stripMetadata(text: string): string {
  text = text.replace(/Conversation info \(untrusted metadata\):\s*```json\s*\{[\s\S]*?\}\s*```\s*/g, "");
  text = text.replace(/Sender \(untrusted metadata\):\s*```json\s*\{[\s\S]*?\}\s*```\s*/g, "");
  return text.trim();
}

/**
 * Parse messages into structured exchanges.
 * Groups messages into user-request → tool-calls → assistant-response exchanges.
 * Now also captures thinking process and tool call details from assistant blocks.
 */
export function extractExchanges(
  messages: unknown[],
  startRefNum: number,
): CachedExchange[] {
  const exchanges: CachedExchange[] = [];
  let refNum = startRefNum;

  const parsed: CachedMessage[] = messages.map((msg) => {
    if (typeof msg !== "object" || msg === null) {
      return { role: "unknown", content: msg };
    }
    const m = msg as Record<string, unknown>;
    return {
      role: (m.role as string) ?? "unknown",
      content: m.content,
      id: m.id as string | undefined,
    };
  });

  let currentUserRequest: string | null = null;
  let currentToolCalls: CachedMessage[] = [];
  let currentRawMessages: CachedMessage[] = [];
  let currentThinking: string[] = [];
  let currentAssistantToolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];

  for (const msg of parsed) {
    if (msg.role === "user") {
      currentUserRequest = extractTextContent(msg.content);
      currentToolCalls = [];
      currentRawMessages = [msg];
      currentThinking = [];
      currentAssistantToolCalls = [];
    } else if (msg.role === "tool" || msg.role === "toolResult") {
      currentToolCalls.push(msg);
      currentRawMessages.push(msg);
    } else if (msg.role === "assistant") {
      currentRawMessages.push(msg);

      // Extract thinking and tool calls from assistant blocks
      const details = extractExecutionDetails(msg.content);
      if (details.thinking.length > 0) {
        currentThinking.push(...details.thinking);
      }
      if (details.toolCalls.length > 0) {
        currentAssistantToolCalls.push(...details.toolCalls);
      }

      // Only finalize exchange if assistant produced text (final response)
      if (details.text.trim() && currentUserRequest) {
        exchanges.push({
          refNum: refNum++,
          userRequest: currentUserRequest,
          toolCalls: currentToolCalls,
          assistantResponse: details.text,
          thinking: currentThinking.length > 0 ? currentThinking : undefined,
          executedTools: currentAssistantToolCalls.length > 0 ? currentAssistantToolCalls : undefined,
          rawMessages: [...currentRawMessages],
          timestamp: Date.now(),
        });
        currentUserRequest = null;
        currentToolCalls = [];
        currentRawMessages = [];
        currentThinking = [];
        currentAssistantToolCalls = [];
      }
    }
  }

  return exchanges;
}

/**
 * Build a truncated summary of prior exchanges for conversation context.
 * Each exchange is condensed to userRequest + first 200 chars of response.
 */
function buildConversationHistory(priorExchanges: CachedExchange[]): string {
  if (priorExchanges.length === 0) return "";

  const lines = priorExchanges.map((ex) => {
    const response =
      ex.assistantResponse.length > 200
        ? ex.assistantResponse.slice(0, 200) + "..."
        : ex.assistantResponse;
    return `User: ${ex.userRequest}\nAssistant: ${response}`;
  });

  return `## Conversation Context\n(Prior exchanges for context — evaluate only the current exchange below)\n\n${lines.join("\n\n")}`;
}

/**
 * Build a concise evaluation context string from an exchange.
 * Includes conversation history from prior exchanges when available.
 */
export function buildEvaluationContext(
  exchange: CachedExchange,
  maxTokens: number,
  priorExchanges: CachedExchange[] = [],
): string {
  const parts: string[] = [];

  // Include conversation history if available
  const history = buildConversationHistory(priorExchanges);
  if (history) {
    parts.push(history);
  }

  parts.push(`## User Request\n${exchange.userRequest}`);

  // Include thinking process if available
  if (exchange.thinking && exchange.thinking.length > 0) {
    const thinkingSummary = exchange.thinking
      .map((t) => (t.length > 300 ? t.slice(0, 300) + "..." : t))
      .join("\n\n");
    parts.push(`## AI Thinking Process\n${thinkingSummary}`);
  }

  // Include detailed tool calls (search queries, URLs, etc.)
  if (exchange.executedTools && exchange.executedTools.length > 0) {
    const toolDetails = exchange.executedTools
      .map((tc) => {
        const args = Object.entries(tc.arguments)
          .map(([k, v]) => `  ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
          .join("\n");
        return `- ${tc.name}\n${args}`;
      })
      .join("\n");
    parts.push(`## Commands & Tools Executed\n${toolDetails}`);
  }

  // Include tool results
  if (exchange.toolCalls.length > 0) {
    const toolSummary = exchange.toolCalls
      .map((tc) => {
        const text = extractTextContent(tc.content);
        return text.length > 500 ? text.slice(0, 500) + "... (truncated)" : text;
      })
      .join("\n---\n");
    parts.push(`## Tool Results (${exchange.toolCalls.length} results)\n${toolSummary}`);
  }

  parts.push(`## Final Response\n${exchange.assistantResponse}`);

  let context = parts.join("\n\n");

  const estimatedTokens = Math.ceil(context.length / 3);
  if (estimatedTokens > maxTokens) {
    const targetLength = maxTokens * 3;
    context = context.slice(0, targetLength) + "\n\n... (context truncated to fit token budget)";
  }

  return context;
}
