import type { Circus, EvaluationResult, PerformerEvaluation } from "./types.js";
import type { CachedExchange } from "../transcript/cache.js";
import { buildEvaluationContext } from "../transcript/extractor.js";
import { buildPerformerPrompt } from "./prompt.js";

export type EvaluationEngine = {
  evaluate: (exchange: CachedExchange, circus: Circus, priorExchanges?: CachedExchange[]) => Promise<EvaluationResult>;
};

export type LlmCaller = (systemPrompt: string, userPrompt: string) => Promise<string>;

/**
 * Create a parallel evaluation engine.
 * Each performer gets its own LLM call, all running concurrently via Promise.all.
 */
export function createParallelEngine(
  llmCall: LlmCaller,
  maxTranscriptTokens: number,
): EvaluationEngine {
  return {
    async evaluate(exchange, circus, priorExchanges = []) {
      const context = buildEvaluationContext(exchange, maxTranscriptTokens, priorExchanges);

      // Fire all performer evaluations in parallel
      const results = await Promise.all(
        circus.performers.map(async (performer): Promise<PerformerEvaluation> => {
          try {
            const prompt = buildPerformerPrompt(performer, context);
            const response = await llmCall(
              `You are ${performer.name} (${performer.emoji}). Evaluate the following AI task execution from your unique perspective.`,
              prompt,
            );
            return {
              performer,
              content: response.trim(),
              severity: performer.severity,
            };
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return {
              performer,
              content: `(Evaluation failed: ${msg})`,
              severity: performer.severity,
            };
          }
        }),
      );

      const summary =
        exchange.userRequest.length > 80
          ? exchange.userRequest.slice(0, 80) + "..."
          : exchange.userRequest;

      return {
        targetSummary: summary,
        evaluations: results,
        timestamp: Date.now(),
        refNum: exchange.refNum,
      };
    },
  };
}

// Backward compat alias
export const createSerialEngine = createParallelEngine;
