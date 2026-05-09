import { describe, expect, it } from "vitest";
import { dailyDigestSchema, weeklyDigestSchema } from "../src/lib/digests/schemas";

describe("digest schemas", () => {
  it("accepts a bounded daily digest payload", () => {
    const parsed = dailyDigestSchema.parse({
      layout_type: "concept_explainer",
      title: "A clear explanation of agents",
      dek: "What changed, why it matters, and where to learn for free.",
      front_page_summary: "The creator explained agent workflows with caveats.",
      plain_english_explanation: "Agents are software loops that use tools and checks.",
      why_it_matters: "This helps non-programmers understand what is automated.",
      what_creator_said: ["Agents need guardrails."],
      what_to_do_next: ["Try reading a free docs page."],
      free_learning_plan: ["Watch one free intro video.", "Build a tiny checklist."],
      glossary: [{ term: "Agent", definition: "A tool-using AI workflow." }],
      topic_links: [{ label: "Search term", url: "https://www.google.com/search?q=ai+agents" }],
      skepticism_notes: "The transcript did not include benchmark evidence.",
      source_notes: [{ timestamp: "00:04:12", note: "Creator defines the concept." }],
      follow_up_from_yesterday: "No prior digest available.",
    });

    expect(parsed.layout_type).toBe("concept_explainer");
  });

  it("rejects arbitrary layouts", () => {
    expect(() =>
      dailyDigestSchema.parse({
        layout_type: "make_up_ui_code",
        title: "Bad",
        dek: "Bad",
        front_page_summary: "Bad",
        plain_english_explanation: "Bad",
        why_it_matters: "Bad",
        what_creator_said: [],
        what_to_do_next: [],
        free_learning_plan: [],
        glossary: [],
        topic_links: [],
        skepticism_notes: "Bad",
        source_notes: [],
        follow_up_from_yesterday: "Bad",
      }),
    ).toThrow();
  });

  it("normalizes null optional follow-up text from providers", () => {
    const parsed = dailyDigestSchema.parse({
      layout_type: "single_big_story",
      title: "A digest",
      dek: "Short dek",
      front_page_summary: "Summary",
      plain_english_explanation: "Explanation",
      why_it_matters: "Why",
      what_creator_said: [],
      what_to_do_next: [],
      free_learning_plan: [],
      glossary: [],
      topic_links: [],
      skepticism_notes: "No uncertainty notes.",
      source_notes: [],
      follow_up_from_yesterday: null,
    });

    expect(parsed.follow_up_from_yesterday).toBe("No prior digest available.");
  });

  it("accepts a weekly newsletter payload with a podcast script", () => {
    const parsed = weeklyDigestSchema.parse({
      title: "This week in practical AI",
      newsletter_markdown: "# This week\n\nA grounded recap.",
      ranked_topics: [{ topic: "Agents", importance_score: 0.9, why_it_matters: "Useful pattern." }],
      what_changed: "More emphasis on evaluation.",
      what_to_do_next: ["Run a small free experiment."],
      free_learning_plan: ["Read free docs."],
      podcast_script: "Welcome back. This week...",
    });

    expect(parsed.podcast_script).toContain("This week");
  });

  it("normalizes weekly provider scores from a 0-100 scale", () => {
    const parsed = weeklyDigestSchema.parse({
      title: "This week in AI",
      newsletter_markdown: "# Week",
      ranked_topics: [{ topic: "Agents", importance_score: 85, why_it_matters: "Important." }],
      what_changed: "The focus shifted.",
      what_to_do_next: [],
      free_learning_plan: [],
      podcast_script: "This week...",
    });

    expect(parsed.ranked_topics[0].importance_score).toBe(0.85);
  });
});
