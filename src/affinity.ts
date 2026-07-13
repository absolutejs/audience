import { z } from "zod";
import type { AudienceContext } from "./ai";
import type { AudienceEntity } from "./psychographics";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const EXTRACT_MAX_TOKENS = 700;
const LIST_MAX = 12;
const ITEM_MAX = 80;
const FIELD_MAX = 400;

const AffinitySchema = z.object({
  audienceDescriptors: z.array(z.string().max(ITEM_MAX)).max(LIST_MAX),
  brands: z.array(z.string().max(ITEM_MAX)).max(LIST_MAX),
  summary: z.string().max(FIELD_MAX),
  topics: z.array(z.string().max(ITEM_MAX)).max(LIST_MAX),
});

/** A structured affinity profile plus an embedding of its descriptor text, so
 *  two profiles can be compared with `affinityOverlap`. */
export type AffinityProfile = z.infer<typeof AffinitySchema> & {
  vector: number[];
};

const SYSTEM = `You extract an AFFINITY profile of a person or brand from public signals — what they and their audience care about. Use only the supplied material; do not invent. Output:
- topics: the subjects, themes, and interests they engage with most. Up to 12 short tags.
- audienceDescriptors: who their audience/customers are — segments, roles, communities, demographics. Up to 12 short phrases.
- brands: brands, products, tools, or names they're associated with or aligned to. Up to 12. Empty if none are evident.
- summary: 1-2 sentences capturing the center of gravity of their affinities.
Keep tags short and concrete. No fabrication.`;

const descriptorText = (profile: z.infer<typeof AffinitySchema>) =>
  [
    profile.summary,
    profile.topics.join(", "),
    profile.audienceDescriptors.join(", "),
    profile.brands.join(", "),
  ]
    .filter((part) => part && part.trim())
    .join(". ");

/** Extract a structured affinity profile from public signals and embed its
 *  descriptor into a vector (via the injected `embed`). Throws on failure. */
export const profileAffinity = async (
  entity: AudienceEntity,
  ctx: AudienceContext,
): Promise<AffinityProfile> => {
  const { object } = await ctx.generateObject({
    feature: "affinityProfile",
    maxTokens: EXTRACT_MAX_TOKENS,
    messages: [
      {
        content: JSON.stringify({
          bio: entity.bio,
          content: entity.content,
          name: entity.name,
          posts: entity.posts,
          signals: entity.signals,
        }),
        role: "user",
      },
    ],
    model: ctx.model ?? DEFAULT_MODEL,
    schema: z.toJSONSchema(AffinitySchema),
    systemPrompt: SYSTEM,
    toolDescription: "Return the affinity profile.",
    toolName: "affinity_profile",
    validate: (raw) => AffinitySchema.parse(raw),
  });

  const [vector] = await ctx.embed([descriptorText(object)]);

  return { ...object, vector: vector ?? [] };
};

/** Cosine similarity of two equal-length vectors, in [-1, 1]. Returns 0 for an
 *  empty or zero vector. */
export const cosineSimilarity = (a: number[], b: number[]): number => {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const sharedLower = (a: string[], b: string[]) => {
  const set = new Set(b.map((item) => item.toLowerCase().trim()));

  return a.filter((item) => set.has(item.toLowerCase().trim()));
};

export type AffinityOverlap = {
  /** Raw cosine of the two affinity vectors, in [-1, 1]. */
  cosine: number;
  rationale: string;
  /** Brands both profiles share (case-insensitive). */
  sharedBrands: string[];
  /** Topics both profiles share (case-insensitive). */
  sharedTopics: string[];
  /** Overlap score in [0, 1] — the cosine clamped to the non-negative range. */
  score: number;
};

const band = (score: number) => {
  if (score >= 0.66) return "strong";
  if (score >= 0.4) return "moderate";

  return "limited";
};

/** Measure audience-affinity overlap between two profiles. Pure: cosine of the
 *  embedded descriptors plus the shared topics/brands and a templated rationale.
 *  No model call — cheap enough to run inline on a scoring path. */
export const affinityOverlap = (
  a: AffinityProfile,
  b: AffinityProfile,
): AffinityOverlap => {
  const cosine = cosineSimilarity(a.vector, b.vector);
  const score = clamp01(cosine);
  const sharedTopics = sharedLower(a.topics, b.topics);
  const sharedBrands = sharedLower(a.brands, b.brands);
  const overlapNote = sharedTopics.length
    ? ` Shared interest in ${sharedTopics.slice(0, 3).join(", ")}.`
    : "";
  const rationale = `${band(score)} audience overlap (affinity similarity ${score.toFixed(
    2,
  )}).${overlapNote}`;

  return { cosine, rationale, sharedBrands, sharedTopics, score };
};
