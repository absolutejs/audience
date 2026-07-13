// Injection contracts. Like @absolutejs/partnership, this package owns the
// prompts/schemas and stays free of provider/billing concerns: the host injects
// the structured-generation call. Affinity work additionally needs an embedding
// call, injected the same way — so the package never picks an embedding model or
// vendor. A host wires both in one place (its metered generate + its embed fn).

export type AIMessage = {
  content: string;
  role: "user" | "assistant" | "system";
};

export type GenerateObjectRequest<T> = {
  feature: string;
  maxTokens: number;
  messages: AIMessage[];
  model: string;
  schema: Record<string, unknown>;
  systemPrompt: string;
  toolDescription: string;
  toolName: string;
  validate: (raw: unknown) => T;
};

/** Host-supplied structured-generation call (provider + metering bound in). */
export type GenerateObject = <T>(
  request: GenerateObjectRequest<T>,
) => Promise<{ object: T }>;

/** Host-supplied embedding call: one vector per input string, in order. */
export type EmbedFn = (texts: string[]) => Promise<number[][]>;

/** Context for LLM-only primitives (e.g. psychographics). */
export type GenerateContext = {
  generateObject: GenerateObject;
  /** Override the primitive's default model when set. */
  model?: string;
};

/** Context for affinity primitives — LLM generation plus an embedding call. */
export type AudienceContext = GenerateContext & {
  embed: EmbedFn;
};
