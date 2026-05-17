import { describe, expect, it } from "vitest";
import {
  EXPLANATION_LEVEL_LABELS,
  normalizeExplanationLevels,
} from "../src/lib/digests/explanation-levels";
import { dailyDigestSchema } from "../src/lib/digests/schemas";

describe("daily digest explanation structure", () => {
  it("uses one shared plain-English section and three proficiency levels", () => {
    expect(EXPLANATION_LEVEL_LABELS).toEqual({
      beginner: "Beginner",
      intermediate: "Practitioner",
      advanced: "Advanced",
    });

    const parsed = dailyDigestSchema.parse({
      layout_type: "concept_explainer",
      title: "Grounded agent systems",
      dek: "A transcript-grounded digest.",
      front_page_summary: "The transcript covered agents, evals, retrieval, and production checks.",
      plain_english_explanation: "AI apps need the same careful checks as other software.",
      explanation_levels: {
        beginner: "For a curious reader, an agent is code that loops through steps.",
        intermediate: "For a practitioner, the digest maps agents to APIs, queues, DB state, and evals.",
        advanced:
          "For an advanced reader, the digest covers orchestration, retrieval, observability, routing, and failure modes.",
      },
      full_level_versions: {
        beginner:
          "TL;DR: agents need checks.\nCreator said: agents need evals.\nWhy it matters: beginners should test small helpers.",
        intermediate:
          "TL;DR: agents need checks.\nCreator said: agents need evals.\nWhy it matters: teams should wire APIs, queues, and DB state carefully.",
        advanced:
          "TL;DR: agents need checks.\nCreator said: agents need evals.\nWhy it matters: production agent stacks need routing, observability, and failure-mode analysis.",
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
    expect(parsed.explanation_levels.beginner).toContain("curious reader");
    expect(parsed.full_level_versions.beginner).toContain("beginners");
    expect(parsed.full_level_versions.advanced).toContain("production agent stacks");
    expect(parsed.concepts_to_learn.advanced).toContain("Model routing");
    expect(parsed.transcript_grounding.transcript_source).toBe("youtube_transcript_free");
  });

  it("does not silently treat full-level versions as a tiny explanation panel", () => {
    const parsed = dailyDigestSchema.parse({
      layout_type: "concept_explainer",
      title: "Grounded agent systems",
      dek: "A transcript-grounded digest.",
      front_page_summary: "The transcript covered agents and evals.",
      plain_english_explanation: "AI apps need checks.",
      explanation_levels: {
        beginner: "Short beginner explanation.",
        intermediate: "Short intermediate explanation.",
        advanced: "Short advanced explanation.",
      },
      full_level_versions: {
        beginner:
          "Beginner full digest. TL;DR, creator claims, why it matters, next steps, and free learning path are all rewritten for beginners.",
        intermediate:
          "Intermediate full digest. TL;DR, creator claims, why it matters, next steps, and free learning path are all rewritten for API/backend readers.",
        advanced:
          "Advanced full digest. TL;DR, creator claims, why it matters, next steps, and free learning path are all rewritten for AI systems readers.",
      },
      why_it_matters: "It helps readers avoid unsupported AI claims.",
      what_creator_said: ["The creator says agents need evals."],
      what_to_do_next: ["Trace a small agent loop."],
      free_learning_plan: ["Read free docs on queues and evals."],
      glossary: [],
      topic_links: [],
      skepticism_notes: "The digest only claims what the transcript supports.",
      source_notes: [{ quote: "production teams should add evals", note: "Grounded quote." }],
      follow_up_from_yesterday: "No prior digest available.",
    });

    expect(parsed.full_level_versions.beginner.length).toBeGreaterThan(
      parsed.explanation_levels.beginner.length,
    );
    expect(parsed.full_level_versions.intermediate).toContain("API/backend readers");
    expect(parsed.full_level_versions.advanced).toContain("AI systems readers");
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

  it("normalizes provider skepticism note arrays without weakening grounding fields", () => {
    const parsed = dailyDigestSchema.parse({
      layout_type: "concept_explainer",
      title: "Grounded agent systems",
      dek: "A transcript-grounded digest.",
      front_page_summary: "The transcript covered agents, evals, retrieval, and production checks.",
      plain_english_explanation: "AI apps need careful checks.",
      why_it_matters: "It helps readers avoid unsupported AI claims.",
      what_creator_said: ["The creator says agents need evals."],
      skepticism_notes: ["The transcript is partial.", "Verify important details."],
      source_notes: [
        {
          quote: "production teams should add evals",
          note: "The transcript discusses safeguards.",
        },
      ],
    });

    expect(parsed.skepticism_notes).toContain("The transcript is partial.");
    expect(parsed.skepticism_notes).toContain("Verify important details.");
    expect(parsed.transcript_grounding.transcript_source).toBe("legacy_digest_unverified");
  });
});
