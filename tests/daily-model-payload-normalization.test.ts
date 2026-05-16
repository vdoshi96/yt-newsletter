import { describe, expect, it } from "vitest";
import { normalizeDailyDigestModelPayload } from "../src/lib/ai/daily-payload";

describe("normalizeDailyDigestModelPayload", () => {
  it("preserves valid daily layout types", () => {
    const payload = normalizeDailyDigestModelPayload({
      layout_type: "single_big_story",
      title: "Valid payload",
    });

    expect(payload.layout_type).toBe("single_big_story");
  });

  it("normalizes common layout spelling before schema validation", () => {
    const payload = normalizeDailyDigestModelPayload({
      layout_type: "concept explainer",
      title: "Spaced layout",
    });

    expect(payload.layout_type).toBe("concept_explainer");
  });

  it("defaults unknown model layout types to a safe digest layout", () => {
    const payload = normalizeDailyDigestModelPayload({
      layout_type: "front_page_feature",
      title: "Unknown layout",
    });

    expect(payload.layout_type).toBe("concept_explainer");
  });

  it("flattens structured full-level versions from models into readable strings", () => {
    const payload = normalizeDailyDigestModelPayload({
      layout_type: "concept_explainer",
      full_level_versions: {
        beginner: {
          tldr: "AI agents need checks.",
          what_creator_said: ["The creator discussed evals."],
          why_it_matters: "Beginners should not trust outputs blindly.",
        },
      },
    });

    expect(payload.full_level_versions).toMatchObject({
      beginner: expect.stringContaining("AI agents need checks."),
    });
    expect((payload.full_level_versions as Record<string, string>).beginner).toContain(
      "The creator discussed evals.",
    );
  });
});
