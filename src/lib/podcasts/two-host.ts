import type { WeeklyDigestPayload } from "../digests/schemas";
import {
  getPodcastScriptConfig,
  getPodcastTargetWordCount,
  type PodcastScriptConfig,
} from "./config";

export type PodcastHostKey = "female_british" | "male_american";

export type PodcastLine = {
  host: PodcastHostKey;
  hostName: string;
  text: string;
};

export const podcastHosts: Record<PodcastHostKey, { name: string; description: string }> = {
  female_british: {
    name: "Clara",
    description:
      "British-accented female host: crisp, analytical, lightly wry, and source-grounded.",
  },
  male_american: {
    name: "Ben",
    description:
      "American-accented male co-host: warm, skeptical, plain-spoken, and conversational.",
  },
};

export function buildTwoHostPodcastLines(
  digest: WeeklyDigestPayload,
  config: PodcastScriptConfig = getPodcastScriptConfig(),
): PodcastLine[] {
  const targetWords = getPodcastTargetWordCount(config);
  const topics = digest.ranked_topics.slice(0, 5);
  const posts = digest.weekly_posts.slice(0, 6);
  const researchBriefs = digest.research_briefs.slice(0, 3);
  const takeaways = digest.what_to_do_next.length
    ? digest.what_to_do_next
    : digest.free_learning_plan;
  const lines: PodcastLine[] = [
    line(
      "female_british",
      `Intro: Welcome back. This is the weekly creator briefing: ${digest.title}. We are treating it like an audio edition of the weekly digest, so the goal is not to race through headlines. The goal is to understand what changed, what seems useful, what remains uncertain, and what a thoughtful listener can do next without buying anything.`,
    ),
    line(
      "male_american",
      `We will keep the conversation grounded in the stored digest. If a claim was thin in the sources, we will say so. If something sounds strategically important, we will still separate the signal from the guesswork. The week in one sentence: ${digest.what_changed}`,
    ),
    line(
      "female_british",
      `For a beginner, the plain-English version is this: ${digest.explanation_levels.beginner}`,
    ),
    line(
      "male_american",
      `For someone already using AI tools, the practical middle layer is: ${digest.explanation_levels.intermediate}`,
    ),
    line(
      "female_british",
      `And for expert listeners, the deeper frame is: ${digest.explanation_levels.advanced}`,
    ),
  ];

  for (const [index, topic] of topics.entries()) {
    const relatedPost = posts[index];
    lines.push(
      line(
        index % 2 === 0 ? "male_american" : "female_british",
        `Topic transition ${index + 1}: ${topic.topic}. ${topic.why_it_matters}`,
      ),
    );

    if (relatedPost) {
      lines.push(
        line(
          index % 2 === 0 ? "female_british" : "male_american",
          `The source-backed story here was "${relatedPost.title}" from ${relatedPost.date}. The digest summary was: ${relatedPost.summary} The reason it mattered was: ${relatedPost.why_it_matters}`,
        ),
      );
    }

    lines.push(
      line(
        index % 2 === 0 ? "male_american" : "female_british",
        `The practical interpretation is to ask what this changes in a real workflow. Does it reduce the time to learn something, improve the quality of a decision, lower the cost of an experiment, or simply make a demo look better than it is? That distinction matters because useful AI adoption usually depends on repeatable value, not surprise.`,
      ),
    );
  }

  lines.push(
    line(
      "female_british",
      `Market memo: ${digest.market_investment_lens} The way to listen to this section is carefully. Market implications are not stock picks. They are clues about where demand, infrastructure pressure, workflow software, and operating budgets may be moving if the source-backed pattern continues.`,
    ),
    line(
      "male_american",
      `Executive memo: ${digest.executive_insights_memo} A board or operator should translate that into questions: what budget does this affect, what metric proves it works, who owns review quality, and what happens if the provider, model, or cost structure changes?`,
    ),
  );

  for (const brief of researchBriefs) {
    lines.push(
      line(
        "female_british",
        `Research desk: ${brief.title}. The thesis is: ${brief.thesis}`,
      ),
      line(
        "male_american",
        `The evidence listed for that brief was: ${formatList(brief.evidence)}. The useful interpretation is: ${formatList(brief.implications)}. The uncertainty to keep in view is: ${brief.uncertainty}`,
      ),
    );
  }

  lines.push(
    line(
      "female_british",
      `Practical takeaways: ${formatList(takeaways)}. The best next step is small enough to do for free and concrete enough that you can tell whether it helped.`,
    ),
    line(
      "male_american",
      `A simple way to use this week's digest is to pick one recurring task, define what good output looks like, run a small experiment, and write down what failed. That turns the week from commentary into practice.`,
    ),
    line(
      "female_british",
      "Uncertainty check: the daily sources may be partial, and the weekly synthesis can only be as strong as the material it summarizes. Treat this as a map for investigation, not as a final verdict.",
    ),
    line(
      "male_american",
      "Closing: that is the week. Keep the claims tied to evidence, keep the experiments small, keep the learning path free where possible, and come back to the daily digests when you want to inspect the underlying story.",
    ),
  );

  return expandTowardTarget(lines, targetWords);
}

export function formatTwoHostPodcastScript(lines: PodcastLine[]) {
  return lines.map((line) => `${line.hostName}: ${line.text}`).join("\n\n");
}

function line(host: PodcastHostKey, text: string): PodcastLine {
  return {
    host,
    hostName: podcastHosts[host].name,
    text: cleanLine(text),
  };
}

function cleanLine(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function expandTowardTarget(lines: PodcastLine[], targetWords: number) {
  const expanded = lines.filter((line) => line.text.length > 0);
  const currentWords = countWords(formatTwoHostPodcastScript(expanded));
  if (currentWords >= targetWords) return expanded;

  return [
    ...expanded.slice(0, -2),
    line(
      "female_british",
      "Before we close, it is worth slowing down on how to listen to a week like this. A short summary can make every item feel equally important, but the real judgment is comparative. Which idea changes a decision? Which one merely names a trend? Which one creates a low-cost experiment a listener can run this week? That is the difference between a recap and a useful briefing.",
    ),
    line(
      "male_american",
      "The other useful filter is reversibility. If an AI workflow is cheap, reversible, and easy to inspect, it is a good candidate for experimentation. If it touches customers, money, legal exposure, hiring, medical choices, or major strategy, the standard should be higher: clearer evaluation, better logging, explicit human review, and a plan for what happens when the system is wrong.",
    ),
    line(
      "female_british",
      "That is also why free learning paths matter. The goal is not to chase a paid course every time the market gets loud. The goal is to build enough understanding to ask better questions: what is the model doing, what context does it have, what evidence would change my mind, and what would make this workflow safe enough to repeat?",
    ),
    ...expanded.slice(-2),
  ];
}

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function formatList(items: string[]) {
  if (!items.length) return "no specific items were stored, so keep the next step conservative";
  if (items.length === 1) return items[0];
  return items.map((item, index) => `${index + 1}. ${item}`).join(" ");
}
