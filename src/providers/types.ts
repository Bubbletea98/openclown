export type LlmProvider = {
  name: string;
  call: (systemPrompt: string, userPrompt: string) => Promise<string>;
};

export type ProviderName = "anthropic" | "openai";
