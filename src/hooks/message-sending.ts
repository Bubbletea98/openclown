import { getNextRefNum } from "../transcript/cache.js";

type MessageSendingEvent = {
  to: string;
  content: string;
  metadata?: Record<string, unknown>;
};

type MessageSendingResult = {
  content?: string;
};

type Logger = {
  info: (msg: string) => void;
  debug: (msg: string) => void;
};

/**
 * Handle message_sending hook: tag outbound messages with reference numbers.
 */
export function handleMessageSending(
  event: MessageSendingEvent,
  logger: Logger,
): MessageSendingResult | void {
  if (!event.content) return;

  // Skip messages that are already tagged or are OpenClown output
  if (event.content.includes("[🎪 #") || event.content.includes("🎪 OpenClown")) {
    return;
  }

  const refNum = getNextRefNum();
  logger.info(`message_sending: tagging outbound message with #${refNum}`);

  return {
    content: `${event.content}\n\n[🎪 #${refNum}]`,
  };
}
