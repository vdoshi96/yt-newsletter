import { describe, expect, it } from "vitest";
import { weeklyDigestSchema } from "../src/lib/digests/schemas";
import {
  buildTwoHostPodcastLines,
  formatTwoHostPodcastScript,
  getPodcastCastForWeek,
} from "../src/lib/podcasts/two-host";

describe("podcast host names and flow", () => {
  it("uses human host names and avoids explicit three-audience exposition", () => {
    const digest = weeklyDigestSchema.parse({
      title: "Week of agent memory",
      newsletter_markdown: "# Week\n\nSource-backed synthesis.",
      explanation_levels: {
        beginner: "AI agents need memory so they do not keep rediscovering the same context.",
        intermediate: "The workflow issue is retrieval design, permissions, and evaluation.",
        advanced: "The architecture issue is matching vector, graph, table, and document retrieval to task contracts.",
      },
      ranked_topics: [
        {
          topic: "Agent memory",
          importance_score: 0.95,
          why_it_matters: "It affects reliability, cost, and whether agents can repeat work.",
        },
      ],
      weekly_posts: [
        {
          date: "2026-05-13",
          type: "video",
          title: "The Memory Wars",
          summary: "Infrastructure vendors are racing to solve memory for AI agents.",
          why_it_matters: "The retrieval contract matters more than the database label.",
        },
      ],
      research_briefs: [
        {
          title: "Retrieval contract",
          thesis: "Agent memory should begin with the job the agent must remember.",
          evidence: ["Daily digest on memory infrastructure"],
          implications: ["Teams should design retrieval needs before choosing tools."],
          uncertainty: "The source material does not prove one database wins every use case.",
        },
      ],
      what_changed: "The week shifted from model capability to implementation infrastructure.",
      what_to_do_next: ["Sketch the memory an agent needs before choosing a database."],
      free_learning_plan: ["Read a free vector search guide and compare it with graph search."],
      podcast_script: "Legacy script.",
      weekly_grounding: {
        grounded: true,
        source: "daily_digests",
        source_digest_count: 1,
        source_date_range: { start: "2026-05-09", end: "2026-05-15" },
      },
    });

    const cast = getPodcastCastForWeek("2026-05-09");
    const script = formatTwoHostPodcastScript(buildTwoHostPodcastLines(digest, undefined, cast));

    expect(cast.label).toBe("Maya and Theo");
    expect(script).toContain("Maya:");
    expect(script).toContain("Theo:");
    expect(script).not.toMatch(/For a beginner/i);
    expect(script).not.toMatch(/intermediate layer/i);
    expect(script).not.toMatch(/advanced layer/i);
    expect(script).not.toMatch(/expert listeners/i);
  });
});
