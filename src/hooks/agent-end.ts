import { addExchange, getNextRefNum } from "../transcript/cache.js";
import { extractExchanges } from "../transcript/extractor.js";

type AgentEndEvent = {
  messages: unknown[];
  success: boolean;
};

/**
 * Handle agent_end hook: extract exchanges from session messages and cache them.
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
