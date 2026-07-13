# @absolutejs/audience

In-house **audience & affinity intelligence** for AbsoluteJS apps — the
ownable parts of what an audience-intelligence SaaS sells, run on your own
provider and embedding model.

- `inferPsychographics` — communication style, values, and motivations of a
  person or brand from public signals (the "how to approach them" layer).
- `profileAffinity` — a structured interest/brand affinity profile, embedded
  into a vector.
- `affinityOverlap` — a measured audience-overlap score between two profiles
  (cosine of their embedded affinities) plus shared topics/brands. Pure, no
  model call.
- `cosineSimilarity` — the underlying vector math, exported.

Like `@absolutejs/partnership`, every primitive is a pure function of typed
input plus an injected AI call. Affinity work also takes an injected `embed`
call, so the package never picks a provider or an embedding model — your app
supplies both, with its own metering and caching.

## Install

```sh
bun add @absolutejs/audience
```

## Wiring

```ts
import type { AudienceContext, GenerateObject } from "@absolutejs/audience";
import { meteredGenerateObjectAI } from "./usage/meteredAI";
import { aiProvider } from "./integrations/aiProvider";
import { embedTexts } from "./integrations/ragStore";

export const audienceCtx = (userSub?: string | null): AudienceContext => ({
  embed: (texts) => embedTexts(texts, "passage"),
  generateObject: ((req) =>
    meteredGenerateObjectAI({ ...req, provider: aiProvider, userSub })) as GenerateObject,
});
```

## Measuring audience overlap

```ts
import { profileAffinity, affinityOverlap } from "@absolutejs/audience";

const me = await profileAffinity({ name: "Me", signals: { niche, offer } }, audienceCtx());
const them = await profileAffinity({ name: company, signals: { summary, industry } }, audienceCtx());

const { score, sharedTopics, rationale } = affinityOverlap(me, them);
// score ∈ [0,1] — a *measured* overlap to use wherever you'd otherwise
// have an LLM guess (e.g. a Trust & Fit "audience overlap" dimension).
```

For a cheap inline path (no affinity extraction), embed two short descriptor
strings yourself and call `cosineSimilarity` directly.

## License

BSL 1.1 → Apache 2.0 on the Change Date (see `LICENSE`). Build your own apps and
SaaS on top of it; you may not offer it as a competing hosted
audience-intelligence service.
