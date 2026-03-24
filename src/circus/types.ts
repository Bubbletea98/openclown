export type Performer = {
  id: string;
  name: string;
  emoji: string;
  prompt: string;
  severity: SeverityLevel;
};

export type SeverityLevel = "insight" | "warning" | "critical";

export type Circus = {
  performers: Performer[];
};

export type PerformerEvaluation = {
  performer: Performer;
  content: string;
  severity: SeverityLevel;
};

export type EvaluationResult = {
  targetSummary: string;
  evaluations: PerformerEvaluation[];
  timestamp: number;
  refNum?: number;
};
