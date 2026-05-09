import type { WeeklyDigestPayload } from "../digests/schemas";
import {
  getPodcastScriptConfig,
  getPodcastTargetWordCount,
  type PodcastScriptConfig,
} from "./config";

export type PodcastHostKey = "primary" | "secondary";
export type PodcastCastId = "puck_kora" | "achird_silafat";

export type PodcastCastHost = {
  name: string;
  geminiVoice: string;
  description: string;
};

export type PodcastHostCast = {
  id: PodcastCastId;
  label: string;
  hosts: Record<PodcastHostKey, PodcastCastHost>;
};

export type PodcastLine = {
  host: PodcastHostKey;
  hostName: string;
  text: string;
};

export const podcastHostCasts: PodcastHostCast[] = [
  {
    id: "puck_kora",
    label: "Puck and Kora",
    hosts: {
      primary: {
        name: "Puck",
        geminiVoice: "Puck",
        description:
          "Upbeat lead host: curious, quick, energetic, and good at making the setup feel lively.",
      },
      secondary: {
        name: "Kora",
        geminiVoice: "Kore",
        description:
          "Firm analytical co-host: clear, grounded, and willing to challenge a fuzzy claim.",
      },
    },
  },
  {
    id: "achird_silafat",
    label: "Achird and Silafat",
    hosts: {
      primary: {
        name: "Achird",
        geminiVoice: "Achird",
        description:
          "Friendly lead host: warm, conversational, and good at explaining the human stakes.",
      },
      secondary: {
        name: "Silafat",
        geminiVoice: "Sulafat",
        description:
          "Warm reflective co-host: thoughtful, measured, and good at connecting dots.",
      },
    },
  },
];

const rotationAnchor = Date.UTC(2026, 4, 3);
const weekMs = 7 * 24 * 60 * 60 * 1000;

export function getPodcastCastForWeek(weekStart: string | Date) {
  const timestamp =
    weekStart instanceof Date ? weekStart.getTime() : Date.parse(`${weekStart}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return podcastHostCasts[0];

  const weeksSinceAnchor = Math.floor((timestamp - rotationAnchor) / weekMs);
  const index =
    ((weeksSinceAnchor % podcastHostCasts.length) + podcastHostCasts.length) %
    podcastHostCasts.length;
  return podcastHostCasts[index];
}

export function buildTwoHostPodcastLines(
  digest: WeeklyDigestPayload,
  config: PodcastScriptConfig = getPodcastScriptConfig(),
  cast: PodcastHostCast = podcastHostCasts[0],
): PodcastLine[] {
  const targetWords = getPodcastTargetWordCount(config);
  const topics = digest.ranked_topics.slice(0, 5);
  const posts = digest.weekly_posts.slice(0, 6);
  const researchBriefs = digest.research_briefs.slice(0, 3);
  const takeaways = digest.what_to_do_next.length
    ? digest.what_to_do_next
    : digest.free_learning_plan;
  const makeLine = lineForCast(cast);
  const primary = cast.hosts.primary.name;
  const secondary = cast.hosts.secondary.name;
  const lines: PodcastLine[] = [
    makeLine(
      "primary",
      `Intro: Welcome back to the weekly creator briefing. I'm ${primary}, and this week the rotating cast is ${cast.label}. We are treating ${digest.title} like a proper podcast, not a rushed audio memo, so the job is to slow down, make the story legible, and keep the claims tied to the stored digest.`,
    ),
    makeLine(
      "secondary",
      `And I'm ${secondary}. My role is to be the co-host who asks the annoying useful question: what actually changed, what is still speculative, and what would a smart listener do with this? Tiny bit of banter, then discipline. The week in one sentence: ${digest.what_changed}`,
    ),
    makeLine(
      "primary",
      `Exactly. We can have a little back-and-forth, but we are not here to perform certainty. We are here to sort signal from theater, translate the jargon, and turn the week into decisions, experiments, and free learning paths.`,
    ),
    makeLine(
      "secondary",
      `That is the promise for this episode: conversational enough to feel human, grounded enough that you can trace the big claims back to the weekly digest, and practical enough that the ending gives you something small to try.`,
    ),
    makeLine(
      "primary",
      `For a beginner, the plain-English version is this: ${digest.explanation_levels.beginner}`,
    ),
    makeLine(
      "secondary",
      `For someone already using AI tools, the practical middle layer is: ${digest.explanation_levels.intermediate}`,
    ),
    makeLine(
      "primary",
      `And for expert listeners, the deeper frame is: ${digest.explanation_levels.advanced}`,
    ),
  ];

  for (const [index, topic] of topics.entries()) {
    const relatedPost = posts[index];
    lines.push(
      makeLine(
        index % 2 === 0 ? "secondary" : "primary",
        `Topic transition ${index + 1}: ${topic.topic}. ${topic.why_it_matters}`,
      ),
    );

    if (relatedPost) {
      lines.push(
        makeLine(
          index % 2 === 0 ? "primary" : "secondary",
          `The source-backed story here was "${relatedPost.title}" from ${relatedPost.date}. The digest summary was: ${relatedPost.summary} The reason it mattered was: ${relatedPost.why_it_matters}`,
        ),
      );
    }

    lines.push(
      makeLine(
        index % 2 === 0 ? "secondary" : "primary",
        `The practical interpretation is to ask what this changes in a real workflow. Does it reduce the time to learn something, improve the quality of a decision, lower the cost of an experiment, or simply make a demo look better than it is? That distinction matters because useful AI adoption usually depends on repeatable value, not surprise.`,
      ),
    );
  }

  lines.push(
    makeLine(
      "primary",
      `Market memo: ${digest.market_investment_lens} The way to listen to this section is carefully. Market implications are not stock picks. They are clues about where demand, infrastructure pressure, workflow software, and operating budgets may be moving if the source-backed pattern continues.`,
    ),
    makeLine(
      "secondary",
      `Executive memo: ${digest.executive_insights_memo} A board or operator should translate that into questions: what budget does this affect, what metric proves it works, who owns review quality, and what happens if the provider, model, or cost structure changes?`,
    ),
  );

  for (const brief of researchBriefs) {
    lines.push(
      makeLine(
        "primary",
        `Research desk: ${brief.title}. The thesis is: ${brief.thesis}`,
      ),
      makeLine(
        "secondary",
        `The evidence listed for that brief was: ${formatList(brief.evidence)}. The useful interpretation is: ${formatList(brief.implications)}. The uncertainty to keep in view is: ${brief.uncertainty}`,
      ),
    );
  }

  lines.push(
    makeLine(
      "primary",
      `Practical takeaways: ${formatList(takeaways)}. The best next step is small enough to do for free and concrete enough that you can tell whether it helped.`,
    ),
    makeLine(
      "secondary",
      `A simple way to use this week's digest is to pick one recurring task, define what good output looks like, run a small experiment, and write down what failed. That turns the week from commentary into practice.`,
    ),
    makeLine(
      "primary",
      "Uncertainty check: the daily sources may be partial, and the weekly synthesis can only be as strong as the material it summarizes. Treat this as a map for investigation, not as a final verdict.",
    ),
    makeLine(
      "secondary",
      "Closing: that is the week. Keep the claims tied to evidence, keep the experiments small, keep the learning path free where possible, and come back to the daily digests when you want to inspect the underlying story.",
    ),
  );

  return expandTowardTarget(lines, targetWords, cast);
}

export function formatTwoHostPodcastScript(lines: PodcastLine[]) {
  return lines.map((line) => `${line.hostName}: ${line.text}`).join("\n\n");
}

function lineForCast(cast: PodcastHostCast) {
  return (host: PodcastHostKey, text: string): PodcastLine => ({
    host,
    hostName: cast.hosts[host].name,
    text: cleanLine(text),
  });
}

function cleanLine(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function expandTowardTarget(lines: PodcastLine[], targetWords: number, cast: PodcastHostCast) {
  const expanded = lines.filter((line) => line.text.length > 0);
  const currentWords = countWords(formatTwoHostPodcastScript(expanded));
  if (currentWords >= targetWords) return expanded;
  const makeLine = lineForCast(cast);

  return [
    ...expanded.slice(0, -2),
    makeLine(
      "primary",
      "Before we close, it is worth slowing down on how to listen to a week like this. A short summary can make every item feel equally important, but the real judgment is comparative. Which idea changes a decision? Which one merely names a trend? Which one creates a low-cost experiment a listener can run this week? That is the difference between a recap and a useful briefing.",
    ),
    makeLine(
      "secondary",
      "The other useful filter is reversibility. If an AI workflow is cheap, reversible, and easy to inspect, it is a good candidate for experimentation. If it touches customers, money, legal exposure, hiring, medical choices, or major strategy, the standard should be higher: clearer evaluation, better logging, explicit human review, and a plan for what happens when the system is wrong.",
    ),
    makeLine(
      "primary",
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
