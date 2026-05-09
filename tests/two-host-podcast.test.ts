import { describe, expect, it } from "vitest";
import {
  buildTwoHostPodcastLines,
  formatTwoHostPodcastScript,
} from "../src/lib/podcasts/two-host";
import { weeklyDigestSchema } from "../src/lib/digests/schemas";

describe("two-host podcast scripts", () => {
  it("uses British female and American male hosts across weekly explanation levels", () => {
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

    const lines = buildTwoHostPodcastLines(digest);
    const script = formatTwoHostPodcastScript(lines);

    expect(lines.some((line) => line.host === "female_british")).toBe(true);
    expect(lines.some((line) => line.host === "male_american")).toBe(true);
    expect(script).toContain("Clara:");
    expect(script).toContain("Ben:");
    expect(script).toContain("AI tools are helpers");
    expect(script).toContain("orchestration under uncertainty");
  });
});
