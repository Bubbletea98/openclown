import type { Performer } from "./types.js";

/**
 * Build the evaluation prompt for a single performer.
 * The performer will evaluate the given context from their unique perspective.
 */
export function buildPerformerPrompt(performer: Performer, evaluationContext: string): string {
  return `${performer.prompt}

---

Below is the AI assistant's task execution to evaluate. Analyze it from your perspective and provide your evaluation.

${evaluationContext}

---

IMPORTANT: Respond in the SAME LANGUAGE as the user's original request. Even if tool calls or results are in a different language, your evaluation must match the user's language.

Respond with ONLY your evaluation (2-3 sentences). Do not repeat the original content. Do not use any prefix or label — just your evaluation content.`;
}

/**
 * Build a combined prompt for serial evaluation mode.
 * A single LLM call role-plays each performer sequentially.
 */
export function buildSerialEvaluationPrompt(
  performers: Performer[],
  evaluationContext: string,
): string {
  const performerDescriptions = performers
    .map(
      (p) =>
        `### ${p.emoji} ${p.name} (${p.id})
Perspective: ${p.prompt}`,
    )
    .join("\n\n");

  return `You are OpenClown, a multi-perspective evaluation system. You will evaluate an AI assistant's task execution from multiple expert perspectives.

For each perspective below, write a concise evaluation (2-3 sentences). Write in the same language as the original user request.

## Perspectives

${performerDescriptions}

---

## Task Execution to Evaluate

${evaluationContext}

---

## Instructions

For EACH perspective, output your evaluation in EXACTLY this format (one block per perspective, keep the exact ID tags):

<evaluation id="${performers[0]?.id ?? "performer"}">
Your 2-3 sentence evaluation here.
</evaluation>

${performers
  .slice(1)
  .map(
    (p) => `<evaluation id="${p.id}">
Your 2-3 sentence evaluation here.
</evaluation>`,
  )
  .join("\n\n")}

IMPORTANT: Write each evaluation in the SAME LANGUAGE as the user's original request. Even if tool calls or results are in a different language, your evaluation must match the user's language.

Be specific, actionable, and honest. If something is genuinely good, say so. If there are real issues, call them out clearly.`;
}

/**
 * Parse the serial evaluation response into per-performer evaluations.
 */
export function parseSerialEvaluationResponse(
  response: string,
  performerIds: string[],
): Map<string, string> {
  const results = new Map<string, string>();

  for (const id of performerIds) {
    const regex = new RegExp(`<evaluation id="${id}">\\s*([\\s\\S]*?)\\s*</evaluation>`);
    const match = response.match(regex);
    if (match?.[1]) {
      results.set(id, match[1].trim());
    }
  }

  return results;
}
