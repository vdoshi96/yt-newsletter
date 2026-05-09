import { describe, expect, it } from "vitest";
import {
  buildTwoHostPodcastLines,
  formatTwoHostPodcastScript,
  getPodcastCastForWeek,
} from "../src/lib/podcasts/two-host";
import { weeklyDigestSchema } from "../src/lib/digests/schemas";

describe("two-host podcast scripts", () => {
  it("rotates Gemini host casts by week", () => {
    expect(getPodcastCastForWeek("2026-05-03").id).toBe("puck_kora");
    expect(getPodcastCastForWeek("2026-05-10").id).toBe("achird_silafat");
    expect(getPodcastCastForWeek("2026-05-17").id).toBe("puck_kora");
  });

  it("opens with rotating host introductions and podcast-style banter", () => {
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
      what_changed: "The week shifted from demos to reliability.",
      what_to_do_next: ["Try a small free checklist exercise."],
      free_learning_plan: ["Read official docs."],
      podcast_script: "Legacy script.",
    });

    const cast = getPodcastCastForWeek("2026-05-03");
    const lines = buildTwoHostPodcastLines(digest, undefined, cast);
    const script = formatTwoHostPodcastScript(lines);

    expect(cast.hosts.primary.geminiVoice).toBe("Puck");
    expect(cast.hosts.secondary.geminiVoice).toBe("Kore");
    expect(lines.some((line) => line.host === "primary")).toBe(true);
    expect(lines.some((line) => line.host === "secondary")).toBe(true);
    expect(script).toContain("Puck:");
    expect(script).toContain("Kora:");
    expect(script).toContain("I'm Puck");
    expect(script).toContain("I'm Kora");
    expect(script).toContain("rotating cast");
    expect(script).toContain("proper podcast");
    expect(script).toContain("AI tools are helpers");
    expect(script).toContain("orchestration under uncertainty");
  });
});
