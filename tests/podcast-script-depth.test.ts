import { describe, expect, it } from "vitest";
import { weeklyDigestSchema } from "../src/lib/digests/schemas";
import {
  buildTwoHostPodcastLines,
  formatTwoHostPodcastScript,
  getPodcastCastForWeek,
} from "../src/lib/podcasts/two-host";
import { resolvePodcastScript } from "../src/lib/podcasts/script-quality";

describe("weekly podcast script depth", () => {
  it("builds a structured long-form conversation instead of a short skim", () => {
    const digest = weeklyDigestSchema.parse({
      title: "Week of AI operating discipline",
      newsletter_markdown: "# Week\n\nA source-backed weekly recap.",
      explanation_levels: {
        beginner:
          "AI tools are useful helpers, but they are not magic. The week was about learning where they help, where they make mistakes, and how people can check the work before trusting it.",
        intermediate:
          "The practical thread was moving from impressive demos to repeatable workflows: define the task, measure whether the AI helped, watch the cost, and keep a human review loop for important decisions.",
        advanced:
          "The deeper issue is operational architecture: model choice, context management, evaluation, auditability, integration cost, and vendor risk all matter once AI leaves a demo and becomes part of a production workflow.",
      },
      executive_insights_memo:
        "The executive signal this week was that AI adoption is becoming an operating question rather than a novelty question. Teams need to know which workflows are worth automating, what errors are tolerable, and whether the infrastructure bill scales with the value created.",
      board_level_implications: [
        "Ask leaders to separate experimentation budget from durable operating budget.",
        "Track unit economics before an AI workflow becomes business critical.",
        "Require evidence that the workflow improves cycle time, quality, or learning speed.",
      ],
      market_investment_lens:
        "The market implication is that value may accrue to the companies that make AI repeatable, observable, and cost-aware, not only to the companies with the flashiest model demos.",
      weekly_posts: [
        {
          date: "2026-05-03",
          type: "video",
          title: "From demo to workflow",
          summary:
            "The creator framed AI progress around repeatable workflows rather than one-off prompts.",
          why_it_matters:
            "That distinction helps readers ask whether a tool can survive real operating constraints.",
        },
        {
          date: "2026-05-04",
          type: "guide",
          title: "Evaluation before automation",
          summary:
            "A practical theme was checking outputs before handing a task to an AI system.",
          why_it_matters:
            "Evaluation is what keeps automation from turning small mistakes into repeated mistakes.",
        },
        {
          date: "2026-05-05",
          type: "market",
          title: "Cost discipline",
          summary:
            "The week connected AI usage with the need to understand recurring compute and vendor costs.",
          why_it_matters:
            "A useful workflow can become fragile if each run is too expensive or too opaque.",
        },
      ],
      research_briefs: [
        {
          title: "Workflow evaluation",
          thesis:
            "Evaluation is the bridge between a promising AI demo and a dependable operating process.",
          evidence: ["Daily digest on evaluation", "Daily digest on workflow design"],
          implications: [
            "Teams should define success before choosing a model.",
            "Qualitative review and simple scorecards can be enough for early pilots.",
          ],
          uncertainty:
            "The source material did not provide benchmark data, so claims about performance should stay cautious.",
        },
      ],
      ranked_topics: [
        {
          topic: "Workflow discipline",
          importance_score: 0.95,
          why_it_matters:
            "It turns AI from a novelty into a repeatable tool that can be checked and improved.",
        },
        {
          topic: "Evaluation",
          importance_score: 0.9,
          why_it_matters:
            "It creates evidence before a team relies on model output.",
        },
        {
          topic: "Cost control",
          importance_score: 0.82,
          why_it_matters:
            "It prevents a useful pilot from becoming an unsustainable operating expense.",
        },
      ],
      what_changed:
        "The week shifted attention from trying AI tools to operating them with clearer standards.",
      what_to_do_next: [
        "Pick one recurring task and write down what a good AI-assisted result would look like.",
        "Run the task three times and compare the AI output with a human-reviewed answer.",
      ],
      free_learning_plan: [
        "Read official docs for one AI tool you already use.",
        "Create a small checklist that catches common mistakes.",
      ],
      podcast_script: "Legacy short script.",
      weekly_grounding: {
        grounded: true,
        source: "daily_digests",
        source_digest_count: 3,
        source_date_range: { start: "2026-05-03", end: "2026-05-09" },
      },
    });

    const script = formatTwoHostPodcastScript(buildTwoHostPodcastLines(digest));

    expect(script).toContain("practical takeaways");
    expect(script).toContain("uncertainty ledger");
    expect(script).toContain("So that is the week");
    expect(script).not.toContain("Intro:");
    expect(script).not.toContain("Market memo:");
    expect(script).not.toContain("Research desk:");
    expect(script.split(/\s+/).filter(Boolean).length).toBeGreaterThan(4000);
  });

  it("replaces short stored or provider scripts with a long-form deterministic fallback", () => {
    const digest = weeklyDigestSchema.parse({
      title: "Week of grounded AI operating practice",
      newsletter_markdown:
        "# Grounded AI practice\n\nThe week focused on checking AI claims against transcript-backed examples before turning them into workflows.",
      what_changed:
        "Teams were pushed to treat AI as an operational system that needs evidence, review, cost tracking, and rollback plans.",
      what_to_do_next: [
        "Pick one recurring task and write down the evidence that would prove AI helped.",
        "Keep a reviewer in the loop until failure cases are visible.",
      ],
      free_learning_plan: [
        "Read one official guide and build a tiny scored example.",
      ],
      weekly_grounding: {
        grounded: true,
        source: "daily_digests",
        source_digest_count: 2,
        source_date_range: { start: "2026-05-16", end: "2026-05-22" },
      },
    });
    const cast = getPodcastCastForWeek("2026-05-16");
    const config = {
      targetMinutes: 30,
      wordsPerMinute: 145,
      generationMode: "provider_script" as const,
    };

    const resolved = resolvePodcastScript({
      candidateScript: "Maya: Quick recap.\n\nTheo: Done.",
      candidateSource: "provider",
      digest,
      config,
      cast,
    });

    expect(resolved.source).toBe("deterministic_fallback");
    expect(resolved.replacedShortScript).toBe(true);
    expect(resolved.originalWordCount).toBeLessThan(resolved.minimumWordCount);
    expect(resolved.wordCount).toBeGreaterThanOrEqual(resolved.minimumWordCount);
    expect(resolved.script).toContain("source contract");
  });
});
