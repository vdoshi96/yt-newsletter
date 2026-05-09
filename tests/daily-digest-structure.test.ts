import { describe, expect, it } from "vitest";
import {
  EXPLANATION_LEVEL_LABELS,
  normalizeExplanationLevels,
} from "../src/lib/digests/explanation-levels";
import { dailyDigestSchema } from "../src/lib/digests/schemas";

describe("daily digest explanation structure", () => {
  it("uses one shared plain-English section and three CS-background levels", () => {
    expect(EXPLANATION_LEVEL_LABELS).toEqual({
      beginner: "Level 1: Beginner CS Background",
      intermediate: "Level 2: Intermediate CS Background",
      advanced: "Level 3: Advanced CS / AI Systems Background",
    });

    const parsed = dailyDigestSchema.parse({
      layout_type: "concept_explainer",
      title: "Grounded agent systems",
      dek: "A transcript-grounded digest.",
      front_page_summary: "The transcript covered agents, evals, retrieval, and production checks.",
      plain_english_explanation: "AI apps need the same careful checks as other software.",
      explanation_levels: {
        beginner: "For a beginner CS reader, an agent is code that loops through steps.",
        intermediate: "For an intermediate CS reader, the digest maps agents to APIs, queues, DB state, and evals.",
        advanced:
          "For an advanced AI systems reader, the digest covers orchestration, retrieval, observability, routing, and failure modes.",
      },
      why_it_matters: "It helps readers avoid unsupported AI claims.",
      what_creator_said: ["The creator says agents need evals."],
      what_to_do_next: ["Trace a small agent loop."],
      free_learning_plan: ["Read free docs on queues and evals."],
      glossary: [{ term: "Eval", definition: "A repeatable check for model behavior." }],
      topic_links: [],
      skepticism_notes: "The digest only claims what the transcript supports.",
      source_notes: [
        {
          timestamp: "00:12",
          quote: "production teams should add evals",
          note: "The transcript discusses safeguards.",
        },
      ],
      concepts_to_learn: {
        beginner: ["Agent", "Queue"],
        intermediate: ["Embeddings", "Eval harness"],
        advanced: ["Model routing", "Observability"],
      },
      transcript_grounding: {
        transcript_source: "youtube_transcript_free",
        transcript_length: 1240,
        video_id: "video-1",
        generation_timestamp: "2026-05-09T21:45:00.000Z",
        key_excerpts: [
          {
            timestamp: "00:12",
            quote: "production teams should add evals",
            note: "The transcript discusses safeguards.",
          },
        ],
      },
      follow_up_from_yesterday: "No prior digest available.",
    });

    expect(parsed.plain_english_explanation).not.toBe(parsed.explanation_levels.beginner);
    expect(parsed.explanation_levels.beginner).toContain("beginner CS reader");
    expect(parsed.concepts_to_learn.advanced).toContain("Model routing");
    expect(parsed.transcript_grounding.transcript_source).toBe("youtube_transcript_free");
  });

  it("does not silently repeat plain English as all three explanation levels", () => {
    const levels = normalizeExplanationLevels(
      {
        beginner: "",
        intermediate: "",
        advanced: "",
      },
      "Plain English stays separate.",
    );

    expect(levels.beginner).toMatch(/level 1 explanation unavailable/i);
    expect(levels.intermediate).toMatch(/level 2 explanation unavailable/i);
    expect(levels.advanced).toMatch(/level 3 explanation unavailable/i);
    expect(new Set(Object.values(levels)).size).toBe(3);
  });
});
