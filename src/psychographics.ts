import { z } from "zod";
import type { GenerateContext } from "./ai";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const SYNTH_MAX_TOKENS = 900;
const LIST_MAX = 6;
const ITEM_MAX = 160;
const FIELD_MAX = 400;

const PsychographicsSchema = z.object({
  communicationStyle: z.string().max(FIELD_MAX),
  motivations: z.array(z.string().max(ITEM_MAX)).max(LIST_MAX),
  summary: z.string().max(FIELD_MAX),
  tone: z.string().max(ITEM_MAX),
  values: z.array(z.string().max(ITEM_MAX)).max(LIST_MAX),
});

export type Psychographics = z.infer<typeof PsychographicsSchema>;

/** Public-signal material about a person or brand. Everything here is treated as
 *  observed public text — the prompt is instructed not to invent beyond it. */
export type AudienceEntity = {
  bio?: string;
  content?: string;
  name?: string;
  posts?: string[];
  /** Free-form extra signals (industry, niche, role, etc.), serialized in. */
  signals?: Record<string, unknown>;
};

const SYSTEM = `You infer a concise psychographic read of a person or brand from PUBLIC signals only (bio, posts, content, supplied facts). Do NOT invent biography or claims not supported by the material; if signal is thin, keep it short and hedge. Output:
- communicationStyle: how they communicate — register, formality, directness, humor, jargon. 1-2 sentences.
- tone: a short phrase capturing their dominant tone (e.g. "earnest and technical", "playful and contrarian").
- values: what they appear to care about / signal as important. 3-6 short items.
- motivations: what seems to drive them — goals, incentives, what they're building toward. 3-6 short items.
- summary: 1-2 sentences a partner could use to tailor how they approach this person/brand.
No flattery, no fabrication.`;

/** Infer communication style, values, and motivations for a person or brand
 *  from public signals — the "how to approach them" layer. Throws on failure. */
export const inferPsychographics = async (
  entity: AudienceEntity,
  ctx: GenerateContext,
): Promise<Psychographics> => {
  const { object } = await ctx.generateObject({
    feature: "psychographics",
    maxTokens: SYNTH_MAX_TOKENS,
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
    schema: z.toJSONSchema(PsychographicsSchema),
    systemPrompt: SYSTEM,
    toolDescription: "Return the psychographic read.",
    toolName: "psychographics",
    validate: (raw) => PsychographicsSchema.parse(raw),
  });

  return object;
};
