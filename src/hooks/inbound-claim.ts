import { setReplyTarget } from "../transcript/cache.js";

const REF_TAG_REGEX = /\[🎪 #(\d+)\]/;

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
      logger.info(`inbound_claim: reply target set to #${refNum} for ${key}`);
    }
  } else {
    logger.debug("inbound_claim: no ref tag found in reply body");
  }
}
