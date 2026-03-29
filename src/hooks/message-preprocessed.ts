import { setReplyTarget, setReplyContent } from "../transcript/cache.js";

const REF_TAG_REGEX = /\[🎪 #(\d+)\]/;
const REPLY_CONTEXT_REGEX = /\[Replying to[^\]]*\]\s*([\s\S]*?)\s*\[\/Replying\]/i;

type Logger = {
  info: (msg: string) => void;
  debug: (msg: string) => void;
};

/**
 * Handle message:preprocessed internal hook.
 *
 * This fires for EVERY inbound message (before command dispatch).
 * The event.context.body contains the full message body including
 * reply context ([Replying to ...]...[/Replying]).
 *
 * We use this to extract quoted text when a user replies to a message
 * with /clown, since inbound_claim only fires for plugin-bound conversations.
 */
export function handleMessagePreprocessed(event: unknown, logger: Logger): void {
  // Internal hook events are wrapped in InternalHookEvent format
  const e = event as {
    type: string;
    action: string;
    sessionKey: string;
    context: Record<string, unknown>;
  };

  // Only handle message:preprocessed events
  if (e.type !== "message" || e.action !== "preprocessed") {
    return;
  }

  const body = (e.context.body as string) ?? "";
  const bodyForAgent = (e.context.bodyForAgent as string) ?? "";

  // Only process if this message contains /clown
  if (!body.includes("/clown") && !bodyForAgent.includes("/clown")) {
    return;
  }

  logger.info(`message:preprocessed: detected /clown in message`);
  logger.info(`message:preprocessed: body = ${body.slice(0, 300)}`);

  // Build a key from available context
  const channelId = (e.context.channelId as string) ?? "unknown";
  const senderId = (e.context.senderId as string) ?? (e.context.from as string) ?? "unknown";
  const key = `${channelId}:${senderId}`;

  // 1. Try [🎪 #N] tag (exact match, highest priority)
  const tagMatch = body.match(REF_TAG_REGEX);
  if (tagMatch?.[1]) {
    const refNum = parseInt(tagMatch[1], 10);
    if (!isNaN(refNum)) {
      setReplyTarget(key, refNum);
      logger.info(`message:preprocessed: reply target set to #${refNum} for ${key}`);
      return;
    }
  }

  // 2. Try extracting quoted text from reply context for content matching
  const replyMatch = body.match(REPLY_CONTEXT_REGEX);
  if (replyMatch?.[1]) {
    const quotedText = replyMatch[1].trim();
    if (quotedText.length > 0) {
      setReplyContent(key, quotedText);
      logger.info(
        `message:preprocessed: reply content extracted (${quotedText.length} chars): "${quotedText.slice(0, 80)}..."`,
      );
      return;
    }
  }

  logger.debug("message:preprocessed: /clown without reply context (bare command)");
}
