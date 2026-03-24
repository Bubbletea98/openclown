import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { addExchange, getNextRefNum } from "./cache.js";
import { extractExchanges } from "./extractor.js";

type SessionMessage = {
  type: string;
  message?: {
    role: string;
    content: unknown;
  };
};

/**
 * Find and read the most recent session transcript from disk.
 * Loads exchanges into the cache so /clown can evaluate them.
 */
export function loadLatestSessionFromDisk(logger: { info: (msg: string) => void }): void {
  const sessionsDir = join(homedir(), ".openclaw", "agents", "main", "sessions");

  let files: string[];
  try {
    files = readdirSync(sessionsDir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    logger.info("transcript reader: no sessions directory found");
    return;
  }

  if (files.length === 0) {
    logger.info("transcript reader: no session files found");
    return;
  }

  // Sort by modification time, newest first
  const sorted = files
    .map((f) => {
      const fullPath = join(sessionsDir, f);
      try {
        return { name: f, path: fullPath, mtime: statSync(fullPath).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((f): f is NonNullable<typeof f> => f !== null)
    .sort((a, b) => b.mtime - a.mtime);

  // Try the most recent files until we find one with exchanges
  for (const file of sorted.slice(0, 3)) {
    const messages = readSessionFile(file.path);
    if (messages.length === 0) continue;

    const startRefNum = getNextRefNum();
    const exchanges = extractExchanges(messages, startRefNum);

    if (exchanges.length > 0) {
      logger.info(
        `transcript reader: loaded ${exchanges.length} exchanges from ${file.name}`,
      );
      for (const exchange of exchanges) {
        addExchange(exchange);
      }
      return;
    }
  }

  logger.info("transcript reader: no exchanges found in recent sessions");
}

function readSessionFile(filePath: string): Array<{ role: string; content: unknown }> {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const messages: Array<{ role: string; content: unknown }> = [];

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as SessionMessage;
      if (parsed.type === "message" && parsed.message?.role) {
        messages.push({
          role: parsed.message.role,
          content: parsed.message.content,
        });
      }
    } catch {
      // Skip malformed lines
    }
  }

  return messages;
}
