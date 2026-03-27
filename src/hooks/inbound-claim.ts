import { setReplyTarget, setReplyResolved } from "../transcript/cache.js";

const REF_TAG_REGEX = /\[🎪 #(\d+)\]/;
const REPLY_CONTEXT_REGEX = /\[Replying to/i;

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
 * Handle inbound_claim hook: detect reply + /clown and extract reference number.
 */
export function handleInboundClaim(event: InboundClaimEvent, logger: Logger): void {
  const commandText = (event.bodyForAgent ?? event.content ?? "").trim();

  if (!commandText.startsWith("/clown")) {
    return;
  }

  logger.info(`inbound_claim: detected /clown command`);
  logger.debug(`inbound_claim: body = ${(event.body ?? "").slice(0, 200)}`);

  // Check the full body (which includes reply context) for a reference tag
  const body = event.body ?? "";
  const match = body.match(REF_TAG_REGEX);

  if (match?.[1]) {
    const refNum = parseInt(match[1], 10);
    if (!isNaN(refNum)) {
      const key = `${event.channel}:${event.senderId ?? "unknown"}`;
      setReplyTarget(key, refNum);
      setReplyResolved(true);
      logger.info(`inbound_claim: reply target set to #${refNum} for ${key}`);
    }
  } else if (REPLY_CONTEXT_REGEX.test(body)) {
    // User replied to a message but we couldn't find a ref tag —
    // either the message was sent before OpenClown, or the tag was truncated.
    setReplyResolved(false);
    logger.info("inbound_claim: reply detected but no ref tag found — message may predate OpenClown");
  } else {
    // No reply context at all — bare /clown command
    setReplyResolved(true); // Not a reply, so no mismatch to warn about
    logger.debug("inbound_claim: no reply context in body");
  }
}
