import type { Performer, SeverityLevel } from "../circus/types.js";
import type { ProviderName } from "../providers/types.js";

export type OpenClownConfig = {
  enabled: boolean;
  autoEvaluate: boolean;
  provider: ProviderName;
  model: string | null;
  baseUrl: string | null;
  maxTranscriptTokens: number;
  tagStyle: "subtle" | "minimal" | "hidden";
  circus: Performer[];
};

export const DEFAULT_CONFIG: OpenClownConfig = {
  enabled: true,
  autoEvaluate: false,
  provider: "anthropic",
  model: null,
  baseUrl: null,
  maxTranscriptTokens: 4000,
  tagStyle: "subtle",
  circus: [],
};

/**
 * Validate and parse the plugin config.
 * Returns the config with defaults applied.
 */
export function parseConfig(raw: unknown): OpenClownConfig {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_CONFIG };
  }

  const obj = raw as Record<string, unknown>;

  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : DEFAULT_CONFIG.enabled,
    autoEvaluate:
      typeof obj.autoEvaluate === "boolean" ? obj.autoEvaluate : DEFAULT_CONFIG.autoEvaluate,
    provider: isValidProvider(obj.provider) ? obj.provider : DEFAULT_CONFIG.provider,
    model: typeof obj.model === "string" ? obj.model : DEFAULT_CONFIG.model,
    baseUrl: typeof obj.baseUrl === "string" ? obj.baseUrl : DEFAULT_CONFIG.baseUrl,
    maxTranscriptTokens:
      typeof obj.maxTranscriptTokens === "number"
        ? obj.maxTranscriptTokens
        : DEFAULT_CONFIG.maxTranscriptTokens,
    tagStyle: isValidTagStyle(obj.tagStyle) ? obj.tagStyle : DEFAULT_CONFIG.tagStyle,
    circus: Array.isArray(obj.circus) ? parseCircus(obj.circus) : DEFAULT_CONFIG.circus,
  };
}

function isValidProvider(value: unknown): value is ProviderName {
  return value === "anthropic" || value === "openai";
}

function isValidTagStyle(value: unknown): value is OpenClownConfig["tagStyle"] {
  return value === "subtle" || value === "minimal" || value === "hidden";
}

function parseCircus(raw: unknown[]): Performer[] {
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      id: String(item.id ?? "unknown"),
      name: String(item.name ?? "Unknown"),
      emoji: String(item.emoji ?? "🎪"),
      prompt: String(item.prompt ?? ""),
      severity: isValidSeverity(item.severity) ? item.severity : "insight",
    }))
    .filter((p) => p.prompt.length > 0);
}

function isValidSeverity(value: unknown): value is SeverityLevel {
  return value === "insight" || value === "warning" || value === "critical";
}
