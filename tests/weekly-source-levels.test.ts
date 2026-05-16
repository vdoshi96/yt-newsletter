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

  it("carries daily transcript grounding into weekly source text", () => {
    const sourceText = buildWeeklySourceText([
      {
        digest_date: "2026-05-01",
        title: "Agents get practical",
        front_page_summary: "The creator described agent workflows.",
        plain_english_explanation: "Legacy simple explanation.",
        full_digest_json: {
          transcript_grounding: {
            transcript_source: "youtube_transcript_free",
            transcript_length: 2400,
            video_id: "video-1",
            generation_timestamp: "2026-05-09T00:00:00.000Z",
            generation_model: "deepseek:deepseek-chat",
            key_excerpts: [
              {
                timestamp: "00:12",
                quote: "Agents are software loops that plan a task.",
                note: "Definition from transcript.",
              },
            ],
          },
          source_notes: [
            {
              timestamp: "00:12",
              quote: "Agents are software loops that plan a task.",
              note: "Definition from transcript.",
            },
          ],
        },
        why_it_matters: "It helps learners avoid vague hype.",
      },
    ]);

    expect(sourceText).toContain("Transcript source: youtube_transcript_free");
    expect(sourceText).toContain("Transcript length: 2400");
    expect(sourceText).toContain("Model: deepseek:deepseek-chat");
    expect(sourceText).toContain("Quote: Agents are software loops");
  });
});
