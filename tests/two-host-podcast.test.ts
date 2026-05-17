import { describe, expect, it } from "vitest";
import {
  buildTwoHostPodcastLines,
  formatTwoHostPodcastScript,
  getPodcastCastForWeek,
} from "../src/lib/podcasts/two-host";
import { weeklyDigestSchema } from "../src/lib/digests/schemas";

describe("two-host podcast scripts", () => {
  it("rotates Gemini host casts by week", () => {
    expect(getPodcastCastForWeek("2026-05-03").id).toBe("maya_theo");
    expect(getPodcastCastForWeek("2026-05-10").id).toBe("nina_jonah");
    expect(getPodcastCastForWeek("2026-05-17").id).toBe("maya_theo");
  });

  it("opens with a source contract and podcast-style host chemistry", () => {
    const digest = weeklyDigestSchema.parse({
      title: "Week of careful AI",
      newsletter_markdown: "# Week\n\nSource-backed summary.",
      explanation_levels: {
        beginner: "AI tools are helpers, but they still need checking.",
        intermediate: "The practical theme is workflow design with evaluation.",
        advanced: "The advanced theme is orchestration under uncertainty.",
      },
      ranked_topics: [
        { topic: "Evaluation", importance_score: 0.9, why_it_matters: "It catches mistakes." },
      ],
      weekly_posts: [
        {
          date: "2026-05-03",
          type: "video",
          title: "Week source",
          summary: "The source-backed example focused on checking AI outputs.",
          why_it_matters: "Checking outputs keeps automation accountable.",
        },
      ],
      what_changed: "The week shifted from demos to reliability.",
      what_to_do_next: ["Try a small free checklist exercise."],
      free_learning_plan: ["Read official docs."],
      podcast_script: "Legacy script.",
      weekly_grounding: {
        grounded: true,
        source: "daily_digests",
        source_digest_count: 2,
        source_date_range: { start: "2026-05-03", end: "2026-05-09" },
      },
      source_references: [
        {
          date: "2026-05-03",
          label: "Daily digest: Week source",
          quotes: [{ quote: "We need to evaluate outputs before trusting them." }],
        },
      ],
    });

    const cast = getPodcastCastForWeek("2026-05-03");
    const lines = buildTwoHostPodcastLines(digest, undefined, cast);
    const script = formatTwoHostPodcastScript(lines);

    expect(cast.hosts.primary.geminiVoice).toBe("Puck");
    expect(cast.hosts.secondary.geminiVoice).toBe("Kore");
    expect(lines.some((line) => line.host === "primary")).toBe(true);
    expect(lines.some((line) => line.host === "secondary")).toBe(true);
    expect(script).toContain("Maya:");
    expect(script).toContain("Theo:");
    expect(script).toContain("I'm Maya");
    expect(script).toContain("I'm Theo");
    expect(script).toContain("source contract");
    expect(script).toContain("transcript-grounded daily digests");
    expect(script).toContain("AI tools are helpers");
    expect(script).toContain("orchestration under uncertainty");
    expect(script).toContain("We need to evaluate outputs before trusting them.");
    expect(script).not.toContain("Intro:");
    expect(script).not.toContain("Topic transition");
  });
});
