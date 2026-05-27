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
      explanation_levels: {
        beginner: "Imagine a helper that follows a checklist and asks tools for help.",
        intermediate: "An agent is a loop that plans, calls tools, checks results, and repeats.",
        advanced: "An agentic workflow combines model calls, tool adapters, state, evals, and guardrails.",
      },
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
    expect(parsed.explanation_levels.beginner).toContain("helper");
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

  it("normalizes empty optional provider fields without weakening required grounding notes", () => {
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
      topic_links: [{ label: "Search term", url: "" }],
      skepticism_notes: "No uncertainty notes.",
      source_notes: [{ timestamp: null, quote: "Grounded transcript quote.", note: "A note." }],
      follow_up_from_yesterday: null,
    });

    expect(parsed.topic_links[0].url).toBeUndefined();
    expect(parsed.source_notes[0].timestamp).toBeUndefined();
    expect(parsed.source_notes[0].quote).toBe("Grounded transcript quote.");
  });

  it("normalizes partial explanation-level payloads instead of rejecting provider output", () => {
    const parsed = dailyDigestSchema.parse({
      layout_type: "single_big_story",
      title: "Partial level payload",
      dek: "A provider returned only one full level.",
      front_page_summary: "The digest is grounded and readable.",
      plain_english_explanation: "Plain explanation fallback.",
      why_it_matters: "It keeps a recoverable provider response from wedging ingestion.",
      skepticism_notes: "Check the transcript grounding before trusting the digest.",
      full_level_versions: {
        beginner: "A beginner version exists.",
      },
    });

    expect(parsed.full_level_versions.beginner).toBe("A beginner version exists.");
    expect(parsed.full_level_versions.intermediate).toContain("Level 2 explanation unavailable");
    expect(parsed.full_level_versions.advanced).toContain("Level 3 explanation unavailable");
  });

  it("accepts a weekly newsletter payload with a podcast script", () => {
    const parsed = weeklyDigestSchema.parse({
      title: "This week in practical AI",
      newsletter_markdown: "# This week\n\nA grounded recap.",
      explanation_levels: {
        beginner: "This week, the big idea is what AI tools can and cannot reliably do.",
        intermediate: "The week centered on agent workflows, evaluation, and practical limits.",
        advanced: "The week connected orchestration patterns, eval pressure, and deployment tradeoffs.",
      },
      ranked_topics: [{ topic: "Agents", importance_score: 0.9, why_it_matters: "Useful pattern." }],
      executive_insights_memo:
        "Board-level memo: AI infrastructure demand is moving from pilots to operating budgets.",
      board_level_implications: ["Ask where AI spend reduces cycle time, not just headcount."],
      market_investment_lens:
        "The market signal is less about demos and more about durable demand for compute and workflow software.",
      weekly_posts: Array.from({ length: 10 }, (_, index) => ({
        date: `2026-05-${String(index + 1).padStart(2, "0")}`,
        type: index % 2 === 0 ? "video" : "guide",
        title: `AI item ${index + 1}`,
        summary: "A source-backed weekly item.",
        why_it_matters: "It helps readers track what changed.",
      })),
      research_briefs: [
        {
          title: "Inference economics",
          thesis: "Costs matter because usage is shifting from experimentation to repeat workflows.",
          evidence: ["Daily digest source", "Date-scoped external source"],
          implications: ["Budget owners need unit-cost visibility."],
          uncertainty: "Pricing and demand may change quickly.",
        },
      ],
      source_notes: [
        {
          date: "2026-05-01",
          label: "Source item",
          url: "https://example.com/source",
          note: "Used as date-scoped research context.",
        },
      ],
      what_changed: "More emphasis on evaluation.",
      what_to_do_next: ["Run a small free experiment."],
      free_learning_plan: ["Read free docs."],
      podcast_script: "Welcome back. This week...",
    });

    expect(parsed.podcast_script).toContain("This week");
    expect(parsed.explanation_levels.intermediate).toContain("agent");
    expect(parsed.weekly_posts).toHaveLength(10);
    expect(parsed.research_briefs[0].title).toBe("Inference economics");
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

  it("normalizes nullable weekly source URLs and string research fields", () => {
    const parsed = weeklyDigestSchema.parse({
      title: "This week in AI",
      newsletter_markdown: "# Week",
      weekly_posts: [
        {
          date: "2026-05-01",
          type: "video",
          title: "Grounded item",
          summary: "A source-backed weekly item.",
          why_it_matters: "It matters.",
          source_url: null,
        },
      ],
      research_briefs: [
        {
          title: "Inference economics",
          thesis: "Costs matter.",
          evidence: "Daily digest source.",
          implications: "Track unit costs.",
          uncertainty: "Pricing changes.",
        },
      ],
      ranked_topics: [{ topic: "Agents", importance_score: 0.8, why_it_matters: "Useful." }],
      what_changed: "The focus shifted.",
      what_to_do_next: [],
      free_learning_plan: [],
      podcast_script: "This week...",
    });

    expect(parsed.weekly_posts[0].source_url).toBeUndefined();
    expect(parsed.research_briefs[0].evidence).toEqual(["Daily digest source."]);
    expect(parsed.research_briefs[0].implications).toEqual(["Track unit costs."]);
  });

  it("normalizes weekly provider list fields and defaults the deterministic podcast script", () => {
    const parsed = weeklyDigestSchema.parse({
      title: "This week in AI",
      newsletter_markdown: "# Week",
      board_level_implications: "Ask for review ownership.",
      ranked_topics: [{ topic: "Agents", importance_score: 0.8, why_it_matters: "Useful." }],
      what_changed: "The focus shifted.",
      what_to_do_next: "Run a small reversible test.",
      free_learning_plan: "Read free documentation.",
    });

    expect(parsed.board_level_implications).toEqual(["Ask for review ownership."]);
    expect(parsed.what_to_do_next).toEqual(["Run a small reversible test."]);
    expect(parsed.free_learning_plan).toEqual(["Read free documentation."]);
    expect(parsed.podcast_script).toBe("Pending deterministic podcast script.");
  });
});
