import { setReplyTarget, setReplyContent } from "../transcript/cache.js";

const REF_TAG_REGEX = /\[🎪 #(\d+)\]/;
const REPLY_CONTEXT_REGEX = /\[Replying to[^\]]*\]\s*([\s\S]*?)\s*\[\/Replying\]/i;

type InboundClaimEvent = {
  content: string;
  body?: string;
  bodyForAgent?: string;
  channel: string;
  senderId?: string;
};

type Logger = {
  info: (msg: string) => void;
  debug: (msg: string) => void;
};

/**
 * Handle inbound_claim hook: detect reply + /clown and extract reference.
 *
 * Priority:
 * 1. [🎪 #N] tag in reply context → exact ref match
 * 2. Quoted text from [Replying to ...] block → content matching
 */
export function handleInboundClaim(event: InboundClaimEvent, logger: Logger): void {
  const commandText = (event.bodyForAgent ?? event.content ?? "").trim();

  if (!commandText.startsWith("/clown")) {
    return;
  }

  logger.info(`inbound_claim: detected /clown command`);
  logger.debug(`inbound_claim: body = ${(event.body ?? "").slice(0, 300)}`);

  const body = event.body ?? "";
  const key = `${event.channel}:${event.senderId ?? "unknown"}`;

  // 1. Try [🎪 #N] tag (exact match, highest priority)
  const tagMatch = body.match(REF_TAG_REGEX);
  if (tagMatch?.[1]) {
    const refNum = parseInt(tagMatch[1], 10);
    if (!isNaN(refNum)) {
      setReplyTarget(key, refNum);
      logger.info(`inbound_claim: reply target set to #${refNum} for ${key}`);
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
        `inbound_claim: reply content extracted (${quotedText.length} chars): "${quotedText.slice(0, 80)}..."`,
      );
      return;
    }
  }

  // No reply context found — bare /clown command
  logger.debug("inbound_claim: no reply context in body");
}
