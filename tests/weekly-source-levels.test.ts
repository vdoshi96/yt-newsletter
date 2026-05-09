import { describe, expect, it } from "vitest";
import { buildWeeklySourceText } from "../src/lib/weekly/source-text";

describe("weekly source text", () => {
  it("includes all daily explanation levels so weekly digests can synthesize each level", () => {
    const sourceText = buildWeeklySourceText([
      {
        digest_date: "2026-05-01",
        title: "Agents get practical",
        front_page_summary: "The creator described agent workflows.",
        plain_english_explanation: "Legacy simple explanation.",
        explanation_levels: {
          beginner: "A helper follows steps and uses tools.",
          intermediate: "A model loops through planning, tool use, and checks.",
          advanced: "The workflow coordinates tool adapters, state, evals, and policy constraints.",
        },
        why_it_matters: "It helps learners avoid vague hype.",
      },
    ]);

    expect(sourceText).toContain("Beginner explanation: A helper follows steps");
    expect(sourceText).toContain("Intermediate explanation: A model loops");
    expect(sourceText).toContain("Advanced explanation: The workflow coordinates");
  });
});
