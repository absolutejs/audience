import { describe, expect, test } from "bun:test";
import {
  affinityOverlap,
  cosineSimilarity,
  inferPsychographics,
  profileAffinity,
  type AffinityProfile,
  type AudienceContext,
  type GenerateObject,
  type GenerateObjectRequest,
} from "../src/index";

const stub = (object: unknown, vectors: number[][] = []) => {
  const calls: GenerateObjectRequest<unknown>[] = [];
  const embedded: string[][] = [];
  const generateObject: GenerateObject = async (request) => {
    calls.push(request as GenerateObjectRequest<unknown>);

    return { object: object as never };
  };
  const ctx: AudienceContext = {
    embed: async (texts) => {
      embedded.push(texts);

      return vectors;
    },
    generateObject,
  };

  return { calls, ctx, embedded };
};

describe("cosineSimilarity", () => {
  test("1 for identical, 0 for orthogonal, 0 for empty", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
    expect(cosineSimilarity([], [1, 2])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("inferPsychographics", () => {
  test("builds the psychographics request", async () => {
    const { calls, ctx } = stub({
      communicationStyle: "direct",
      motivations: ["growth"],
      summary: "earnest builder",
      tone: "earnest and technical",
      values: ["craft"],
    });
    const result = await inferPsychographics(
      { bio: "builds dev tools", name: "Jane" },
      ctx,
    );
    expect(calls[0]?.toolName).toBe("psychographics");
    expect(result.tone).toBe("earnest and technical");
  });
});

describe("profileAffinity", () => {
  test("extracts the profile and embeds its descriptor", async () => {
    const { ctx, embedded } = stub(
      {
        audienceDescriptors: ["frontend engineers"],
        brands: ["Vercel"],
        summary: "centered on web dev",
        topics: ["react", "ci"],
      },
      [[0.1, 0.2, 0.3]],
    );
    const profile = await profileAffinity({ name: "Acme" }, ctx);
    expect(profile.topics).toContain("react");
    expect(profile.vector).toEqual([0.1, 0.2, 0.3]);
    // The embedded descriptor weaves in summary + topics + descriptors + brands.
    expect(embedded[0]?.[0]).toContain("web dev");
    expect(embedded[0]?.[0]).toContain("react");
  });
});

describe("affinityOverlap", () => {
  const make = (vector: number[], topics: string[], brands: string[] = []): AffinityProfile => ({
    audienceDescriptors: [],
    brands,
    summary: "",
    topics,
    vector,
  });

  test("scores cosine, surfaces shared topics/brands, bands the rationale", () => {
    const a = make([1, 0, 0], ["React", "CI"], ["Vercel"]);
    const b = make([1, 0, 0], ["react", "design"], ["vercel"]);
    const overlap = affinityOverlap(a, b);
    expect(overlap.score).toBeCloseTo(1, 5);
    expect(overlap.sharedTopics).toContain("React");
    expect(overlap.sharedBrands).toContain("Vercel");
    expect(overlap.rationale).toContain("strong");
  });

  test("clamps a negative cosine to 0", () => {
    const a = make([1, 0], ["x"]);
    const b = make([-1, 0], ["y"]);
    const overlap = affinityOverlap(a, b);
    expect(overlap.cosine).toBeCloseTo(-1, 5);
    expect(overlap.score).toBe(0);
    expect(overlap.rationale).toContain("limited");
  });
});

import { affinityItemsOverlap, type AffinityItem } from "../src/index";

describe("affinityItemsOverlap", () => {
  const item = (name: string, affinity: number): AffinityItem => ({ affinity, name });

  test("scores shared affinities and lists them strongest-first", () => {
    const a = [item("React", 0.9), item("CI", 0.6), item("Design", 0.2)];
    const b = [item("react", 0.8), item("ci", 0.5), item("Marketing", 0.7)];
    const r = affinityItemsOverlap(a, b);
    expect(r.method).toBe("shared-affinity");
    expect(r.score).toBeGreaterThan(0);
    expect(r.sharedAffinities.map((s) => s.name)).toEqual(["React", "CI"]);
    expect(r.rationale).toContain("React");
  });

  test("disjoint audiences score ~0 with no shared affinities", () => {
    const r = affinityItemsOverlap([item("A", 1)], [item("B", 1)]);
    expect(r.score).toBe(0);
    expect(r.sharedAffinities).toEqual([]);
  });
});
