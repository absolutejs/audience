import { cosineSimilarity } from "./affinity";

// A vendor audience-intelligence source — the adapter contract. Real providers
// (Audiense, GWI, SparkToro, Brandwatch, …) implement the subset they support;
// every method is optional so a consumer can feature-detect (`if (source.overlap)`).
// This complements the own-it primitives (inferPsychographics / profileAffinity /
// affinityOverlap): when a vendor source is present it supplies MEASURED audience
// data; otherwise the app falls back to the derived versions. The contract is
// deliberately provider-agnostic so a new vendor adapter is the only thing that
// has to change to support it.

export type AudienceRef = {
  id: string;
  name?: string;
  /** Provider-specific extras (segment ids, baseline id, source handle, …). */
  meta?: Record<string, unknown>;
};

export type AffinityKind =
  | "brand"
  | "hashtag"
  | "influencer"
  | "interest"
  | "media"
  | "other";

export type AffinityItem = {
  /** Display name — interest, brand, influencer handle, media outlet, etc. */
  name: string;
  /** How strongly this audience over-indexes on it, vendor-normalized to [0,1]. */
  affinity: number;
  /** Affinity in the baseline/general population, when the vendor compares. */
  baselineAffinity?: number;
  /** Over/under-index vs the baseline (affinity / baselineAffinity), when known. */
  uniqueness?: number;
  /** Stable id for set operations (vendor id / handle); falls back to name. */
  id?: string;
  kind?: AffinityKind;
};

export type DemographicBucket = { label: string; share: number };

export type AudienceProfile = {
  ref: AudienceRef;
  /** Audience size (members), when known. */
  size?: number;
  /** Sub-segments / clusters of this audience. */
  segments?: AudienceRef[];
  /** Demographic / socioeconomic distributions keyed by dimension
   *  (gender, age, country, income, …). */
  demographics?: Record<string, DemographicBucket[]>;
  /** Interest / brand / influencer affinities, strongest first. */
  affinities?: AffinityItem[];
  /** Psychographic / personality scores (e.g. OCEAN traits), [0,1]. */
  psychographics?: { score: number; trait: string }[];
  summary?: string;
};

export type AudienceOverlapResult = {
  /** Overlap score in [0,1]. */
  score: number;
  /** The affinities the two audiences share, strongest first. */
  sharedAffinities: AffinityItem[];
  /** How the score was derived ("vendor-intersection" when native, else "shared-affinity"). */
  method: string;
  rationale?: string;
};

export type AudienceQuery = {
  domain?: string;
  /** A social handle, name, or vendor-native query. */
  handle?: string;
  name?: string;
  [key: string]: unknown;
};

/** A vendor audience-intelligence provider. All methods optional — feature-detect. */
export type AudienceSource = {
  /** Short provider id, e.g. "audiense". */
  readonly provider: string;
  /** List the audiences / reports available to the account. */
  listAudiences?: () => Promise<AudienceRef[]>;
  /** Resolve a query (handle/domain/name) to an audience ref, if the vendor supports lookup. */
  resolveAudience?: (query: AudienceQuery) => Promise<AudienceRef | null>;
  /** Full profile for one audience (size, segments, demographics, affinities, psychographics). */
  getAudience?: (ref: AudienceRef | string) => Promise<AudienceProfile>;
  /** Just the affinity graph for an audience. */
  affinities?: (ref: AudienceRef | string) => Promise<AffinityItem[]>;
  /** Measured overlap between two audiences — the partnership-fit signal. */
  overlap?: (
    a: AudienceRef | string,
    b: AudienceRef | string,
  ) => Promise<AudienceOverlapResult>;
};

const keyOf = (item: AffinityItem) =>
  (item.id ?? item.name).toLowerCase().trim();

/** Compute an audience-overlap from two affinity lists — a weighted cosine over
 *  the union of affinities plus the shared items. The fallback any adapter can
 *  use when the vendor has no native two-audience intersection endpoint. */
export const affinityItemsOverlap = (
  a: AffinityItem[],
  b: AffinityItem[],
): AudienceOverlapResult => {
  const aByKey = new Map(a.map((item) => [keyOf(item), item]));
  const bByKey = new Map(b.map((item) => [keyOf(item), item]));
  const keys = new Set([...aByKey.keys(), ...bByKey.keys()]);

  const va: number[] = [];
  const vb: number[] = [];
  const shared: AffinityItem[] = [];
  for (const key of keys) {
    const ia = aByKey.get(key);
    const ib = bByKey.get(key);
    va.push(ia?.affinity ?? 0);
    vb.push(ib?.affinity ?? 0);
    if (ia && ib) shared.push(ia);
  }
  shared.sort((x, y) => y.affinity - x.affinity);

  const score = Math.max(0, cosineSimilarity(va, vb));
  const rationale = shared.length
    ? `Share ${shared.length} affinities incl. ${shared
        .slice(0, 3)
        .map((item) => item.name)
        .join(", ")}.`
    : "Few shared affinities.";

  return { method: "shared-affinity", rationale, score, sharedAffinities: shared };
};
