import type { EvaluationResult, SeverityLevel } from "../circus/types.js";

const SEVERITY_ICONS: Record<SeverityLevel, string> = {
  insight: "💡 Insight",
  warning: "⚠️ Warning",
  critical: "🔴 Critical",
};

/**
 * Format an evaluation result for display in a chat message.
 * Designed to be readable on both desktop and mobile (WhatsApp).
 */
export function formatEvaluation(result: EvaluationResult): string {
  const lines: string[] = [];

  lines.push("🎪 OpenClown Evaluation");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push(`📋 Evaluating: "${result.targetSummary}"`);

  for (const evaluation of result.evaluations) {
    lines.push("");
    lines.push(
      `${evaluation.performer.emoji} ${evaluation.performer.name} (${evaluation.performer.id})`,
    );
    lines.push(evaluation.content);
    lines.push(`Severity: ${SEVERITY_ICONS[evaluation.severity]}`);
  }

  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("/clown encore · /clown circus · /clown help");

  return lines.join("\n");
}
