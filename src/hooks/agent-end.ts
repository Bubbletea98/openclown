import { addExchange, getNextRefNum } from "../transcript/cache.js";
import { extractExchanges, extractTextContent } from "../transcript/extractor.js";

type AgentEndEvent = {
  messages: unknown[];
  success: boolean;
};

const TOOL_SUMMARY_MAX_CHARS = 300;

/**
 * Handle agent_end hook: extract exchanges from session messages and cache them.
 * Generates tool call summaries for persistence.
 */
export function handleAgentEnd(event: AgentEndEvent, logger: Logger): void {
  if (!event.success || !event.messages || event.messages.length === 0) {
    logger.debug("agent_end: skipped (no messages or not successful)");
    return;
  }

  logger.info(`agent_end: processing ${event.messages.length} messages`);

  const startRefNum = getNextRefNum();
  const exchanges = extractExchanges(event.messages, startRefNum);

  logger.info(`agent_end: extracted ${exchanges.length} exchanges`);

  for (const exchange of exchanges) {
    // Generate tool call summaries for persistence
    if (exchange.toolCalls.length > 0) {
      exchange.toolCallSummaries = exchange.toolCalls.map((tc) => {
        const text = extractTextContent(tc.content);
        return text.length > TOOL_SUMMARY_MAX_CHARS
          ? text.slice(0, TOOL_SUMMARY_MAX_CHARS) + "..."
          : text;
      });
    }

    addExchange(exchange);
    logger.info(
      `agent_end: cached exchange #${exchange.refNum}: "${exchange.userRequest.slice(0, 60)}..."`,
    );
  }
}

type Logger = {
  info: (msg: string) => void;
  debug: (msg: string) => void;
};
