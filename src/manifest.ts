import { defineManifest, toolFactory } from "@absolutejs/manifest";
import { Type } from "@sinclair/typebox";
import { affinityOverlap, profileAffinity } from "./affinity";
import type { AudienceContext } from "./ai";
import { inferPsychographics } from "./psychographics";

const tool = toolFactory<AudienceContext>();

/* Everything here is a pure function of typed input plus the injected
 * AudienceContext (the host's structured-generation call + embedding call),
 * so the context IS the runtime and `model` is the only serializable knob. */
const entityInput = {
  bio: Type.Optional(Type.String({ description: "Public bio text." })),
  content: Type.Optional(
    Type.String({
      description: "Longer public content (site copy, articles).",
    }),
  ),
  name: Type.Optional(Type.String()),
  posts: Type.Optional(Type.Array(Type.String())),
  signals: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description: "Free-form extra facts (industry, niche, role…).",
    }),
  ),
};

export const manifest = defineManifest<AudienceContext, AudienceContext>()({
  contract: 2,
  identity: {
    accent: "#ec4899",
    category: "growth",
    description:
      "In-house audience & affinity intelligence — the ownable parts of what an audience-intelligence SaaS sells, run on your own AI provider and embedding model: psychographic inference (communication style, values, motivations from public signals), structured interest/brand affinity profiles embedded into vectors, and a measured audience-overlap score (pure cosine, no model call).",
    docsUrl: "https://github.com/absolutejs/audience",
    name: "@absolutejs/audience",
    tagline: "Understand your audience and how it overlaps with others.",
  },
  settings: Type.Object({
    model: Type.Optional(
      Type.String({
        description:
          "Override the AI model used for psychographic and affinity extraction. Leave empty for each primitive's default.",
        title: "AI model",
        "x-group": "advanced",
      }),
    ),
  }),
  tools: {
    audience_overlap: tool.runtime({
      annotations: { idempotentHint: true, openWorldHint: true },
      authorization: {
        approval: "never",
        audience: "authenticated",
        destinations: ["configured-audience-research-provider"],
        effects: ["read", "external-network"],
        idempotency: { mode: "host" },
        requiredScopes: ["audience:read"],
        reversible: false,
      },
      description:
        "Measure the audience overlap between two people or brands from their public signals: extracts an affinity profile for each, embeds them, and returns a 0–1 overlap score with shared topics/brands and a rationale.",
      handler: async ({ a, b }, ctx) => {
        const [profileA, profileB] = await Promise.all([
          profileAffinity(a, ctx),
          profileAffinity(b, ctx),
        ]);

        return JSON.stringify(affinityOverlap(profileA, profileB));
      },
      input: Type.Object({
        a: Type.Object(entityInput, { description: "First entity." }),
        b: Type.Object(entityInput, { description: "Second entity." }),
      }),
    }),
    infer_psychographics: tool.runtime({
      annotations: { idempotentHint: true, openWorldHint: true },
      authorization: {
        approval: "never",
        audience: "authenticated",
        destinations: ["configured-audience-research-provider"],
        effects: ["read", "external-network"],
        idempotency: { mode: "host" },
        requiredScopes: ["audience:read"],
        reversible: false,
      },
      description:
        "Infer how to approach a person or brand from public signals only: communication style, tone, values, motivations, and a short summary. Hedges rather than inventing when signal is thin.",
      handler: async (input, ctx) =>
        JSON.stringify(await inferPsychographics(input, ctx)),
      input: Type.Object(entityInput),
    }),
  },
  wiring: [
    {
      description:
        "Inject your AI provider and embedding model once; every audience primitive is a pure function of typed input plus this context.",
      id: "default",
      server: {
        code: [
          "const audienceContext: AudienceContext = {",
          "\t// TODO: wire your embedding call — one vector per input string",
          "\t// (e.g. @absolutejs/rag's embedding provider).",
          "\tembed: async (texts) => {",
          "\t\tthrow new Error('audience: embed not wired (' + texts.length + ' texts)');",
          "\t},",
          "\t// TODO: wire your structured-generation call with provider and",
          "\t// metering bound in (e.g. @absolutejs/ai).",
          "\tgenerateObject: async () => {",
          "\t\tthrow new Error('audience: generateObject not wired');",
          "\t},",
          "\tmodel: ${settings.model}",
          "};",
        ].join("\n"),
        imports: [
          {
            from: "@absolutejs/audience",
            names: ["AudienceContext"],
            typeOnly: true,
          },
        ],
        placement: "module-scope",
      },
      title: "Inject your AI and embedding calls",
    },
  ],
});
