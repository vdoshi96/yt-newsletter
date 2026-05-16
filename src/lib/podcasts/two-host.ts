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
  section:
    | "cold_open"
    | "source_contract"
    | "thesis"
    | "topic"
    | "market"
    | "research"
    | "practical"
    | "uncertainty"
    | "closing";
  pauseAfterMs?: number;
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
  const sourceCount = digest.weekly_grounding.source_digest_count || digest.source_references.length;
  const dateRange = digest.weekly_grounding.source_date_range;
  const dateWindow = dateRange ? `${dateRange.start} through ${dateRange.end}` : "the stored week";
  const quoteAnchors = collectQuoteAnchors(digest);
  const primary = cast.hosts.primary.name;
  const secondary = cast.hosts.secondary.name;
  const lines: PodcastLine[] = [
    makeLine(
      "primary",
      `Welcome back. I'm ${primary}, and the human question this week is how to use AI without outsourcing judgment. The title on the table is ${digest.title}, but the real job is slower and more useful: make the story legible, keep the evidence visible, and leave with something practical to try.`,
      "cold_open",
      900,
    ),
    makeLine(
      "secondary",
      `And I'm ${secondary}. I get the delightful job of asking the useful annoying questions: what actually changed, what is still speculative, and what would a careful listener do with this? The week in one grounded sentence: ${digest.what_changed}`,
      "cold_open",
    ),
    makeLine(
      "primary",
      `Before we go anywhere, here is the source contract. This episode is based on ${sourceCount || "the available"} transcript-grounded daily digest${sourceCount === 1 ? "" : "s"} from ${dateWindow}, plus the weekly synthesis stored in the app. We can interpret those sources, but we are not adding outside news, stock calls, or mysterious facts that wandered in from the internet with a tiny suitcase.`,
      "source_contract",
      700,
    ),
    makeLine(
      "secondary",
      `That matters because an AI recap can become a parade of shiny nouns. We are going to use a stricter loop: claim, source-backed example, practical meaning, and uncertainty. If a claim cannot survive that loop, it does not get promoted from interesting to true.`,
      "source_contract",
      900,
    ),
    makeLine(
      "primary",
      `For a beginner, the plain-English version is this: ${digest.explanation_levels.beginner}`,
      "thesis",
    ),
    makeLine(
      "secondary",
      `For someone already using AI tools, the practical middle layer is: ${digest.explanation_levels.intermediate}`,
      "thesis",
    ),
    makeLine(
      "primary",
      `And for expert listeners, the deeper frame is: ${digest.explanation_levels.advanced}`,
      "thesis",
      1000,
    ),
  ];

  for (const [index, topic] of topics.entries()) {
    const relatedPost = posts[index];
    const anchor = quoteAnchors[index % Math.max(quoteAnchors.length, 1)];
    lines.push(
      makeLine(
        index % 2 === 0 ? "secondary" : "primary",
        `Let's move into ${topic.topic}. The reason this earned time is that ${topic.why_it_matters}`,
        "topic",
      ),
    );

    if (relatedPost) {
      lines.push(
        makeLine(
          index % 2 === 0 ? "primary" : "secondary",
          `The source-backed story here was "${relatedPost.title}" from ${relatedPost.date}. The digest summary was: ${relatedPost.summary} The reason it mattered was: ${relatedPost.why_it_matters}${anchor ? ` One transcript anchor to keep us honest is: "${anchor}".` : ""}`,
          "topic",
          500,
        ),
      );
    }

    lines.push(
      makeLine(
        index % 2 === 0 ? "secondary" : "primary",
        `The practical interpretation is to ask what this changes in a real workflow. Does it reduce the time to learn something, improve the quality of a decision, lower the cost of an experiment, or simply make a demo look better than it is? That distinction matters because useful AI adoption usually depends on repeatable value, not surprise.`,
        "topic",
        index === topics.length - 1 ? 1000 : 500,
      ),
    );
  }

  lines.push(
    makeLine(
      "primary",
      `Now let's handle the market and operator lens carefully. ${digest.market_investment_lens} The way to listen to this section is with restraint. Market implications are not stock picks. They are clues about where demand, infrastructure pressure, workflow software, and operating budgets may be moving if the source-backed pattern continues.`,
      "market",
      700,
    ),
    makeLine(
      "secondary",
      `For an executive or board listener, the memo is this: ${digest.executive_insights_memo} Translate that into questions: what budget does this affect, what metric proves it works, who owns review quality, and what happens if the provider, model, or cost structure changes?`,
      "market",
      1100,
    ),
  );

  for (const brief of researchBriefs) {
    lines.push(
      makeLine(
        "primary",
        `Let's go to the research desk for ${brief.title}. The thesis is: ${brief.thesis}`,
        "research",
      ),
      makeLine(
        "secondary",
        `The evidence listed for that brief was: ${formatList(brief.evidence)}. The useful interpretation is: ${formatList(brief.implications)}. The uncertainty to keep in view is: ${brief.uncertainty}`,
        "research",
        800,
      ),
    );
  }

  lines.push(
    makeLine(
      "primary",
      `Here are the practical takeaways: ${formatList(takeaways)}. The best next step is small enough to do for free and concrete enough that you can tell whether it helped.`,
      "practical",
    ),
    makeLine(
      "secondary",
      `A simple way to use this week's digest is to pick one recurring task, define what good output looks like, run a small experiment, and write down what failed. That turns the week from commentary into practice.`,
      "practical",
      900,
    ),
    makeLine(
      "primary",
      "Let's make the uncertainty ledger explicit. The daily sources may be partial, and the weekly synthesis can only be as strong as the material it summarizes. A direction can be plausible without being proven, a market lens can be useful without being a prediction, and a promising workflow can still fail when real data, permissions, costs, or review burden show up.",
      "uncertainty",
      700,
    ),
    makeLine(
      "secondary",
      "So that is the week. Keep the claims tied to evidence, keep the experiments small, keep the learning path free where possible, and come back to the daily digests when you want to inspect the underlying story.",
      "closing",
    ),
  );

  return expandTowardTarget(lines, targetWords, cast, digest);
}

export function formatTwoHostPodcastScript(lines: PodcastLine[]) {
  return lines.map((line) => `${line.hostName}: ${line.text}`).join("\n\n");
}

function lineForCast(cast: PodcastHostCast) {
  return (
    host: PodcastHostKey,
    text: string,
    section: PodcastLine["section"] = "topic",
    pauseAfterMs?: number,
  ): PodcastLine => ({
    host,
    hostName: cast.hosts[host].name,
    section,
    pauseAfterMs,
    text: cleanLine(text),
  });
}

function cleanLine(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function expandTowardTarget(
  lines: PodcastLine[],
  targetWords: number,
  cast: PodcastHostCast,
  digest: WeeklyDigestPayload,
) {
  const expanded = lines.filter((line) => line.text.length > 0);
  const makeLine = lineForCast(cast);
  if (countWords(formatTwoHostPodcastScript(expanded)) >= targetWords) return expanded;

  const closing = expanded.slice(-2);
  const body = expanded.slice(0, -2);
  const deepDive = buildDeepDiveExpansion(digest, cast);
  for (const line of deepDive) {
    body.push(line);
    if (countWords(formatTwoHostPodcastScript([...body, ...closing])) >= targetWords) {
      return [...body, ...closing];
    }
  }

  let pass = 1;
  const practicalLenses = [
    "learning",
    "workflow",
    "risk",
    "cost",
    "measurement",
    "governance",
  ];
  while (countWords(formatTwoHostPodcastScript([...body, ...closing])) < targetWords) {
    const topic = digest.ranked_topics[pass % Math.max(digest.ranked_topics.length, 1)];
    const post = digest.weekly_posts[pass % Math.max(digest.weekly_posts.length, 1)];
    const lens = practicalLenses[pass % practicalLenses.length];
    body.push(
      makeLine(
        pass % 2 === 0 ? "primary" : "secondary",
        `Let's revisit the week through a ${lens} lens. ${
          topic
            ? `${topic.topic} matters here because ${topic.why_it_matters}`
            : `The stored digest's main change was: ${digest.what_changed}`
        } ${
          post
            ? `The closest source-backed example is "${post.title}" from ${post.date}, where the summary was: ${post.summary}`
            : "The stored weekly source did not include another specific post for this pass."
        } The ${lens} question is: what would make this claim useful enough to test, limited enough to stay reversible, and clear enough that a listener could tell whether it helped?`,
      ),
    );
    pass += 1;
  }

  return [
    ...body,
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
    ...closing,
  ];
}

function buildDeepDiveExpansion(digest: WeeklyDigestPayload, cast: PodcastHostCast) {
  const makeLine = lineForCast(cast);
  const lines: PodcastLine[] = [];
  const topics = digest.ranked_topics.length
    ? digest.ranked_topics
    : [{ topic: "The weekly change", importance_score: 1, why_it_matters: digest.what_changed }];
  const posts = digest.weekly_posts.length
    ? digest.weekly_posts
    : [
        {
          date: digest.weekly_grounding.source_date_range?.start ?? "this week",
          type: "weekly digest",
          title: digest.title,
          summary: digest.newsletter_markdown.slice(0, 500),
          why_it_matters: digest.what_changed,
        },
      ];

  lines.push(
    makeLine(
      "secondary",
      `Let's make this useful for someone who does not live inside AI discourse all day. The dangerous version of a weekly AI recap is a parade of shiny nouns. Very impressive, very caffeinated, and almost useless. The better version asks three boring but powerful questions: what is the job to be done, what evidence says the system helps, and what breaks when the system is wrong? This week, the stored digest says the core change was: ${digest.what_changed}`,
    ),
    makeLine(
      "primary",
      `That framing keeps the episode factual. We can be funny about the hype, because some of the hype deserves a small eye roll, but the facts still come from the weekly digest and the source-backed daily material. So when we talk about a workflow, a market signal, or a research idea, we are treating it as a claim to inspect, not a slogan to embroider on a hoodie.`,
    ),
  );

  for (const [index, topic] of topics.slice(0, 5).entries()) {
    const post = posts[index % posts.length];
    lines.push(
      makeLine(
        index % 2 === 0 ? "secondary" : "primary",
        `Deep dive ${index + 1}: ${topic.topic}. The digest ranks this because ${topic.why_it_matters} For a wider audience, translate that into a normal-life question: does this help a person make a better decision, learn faster, avoid repeated busywork, or understand a risk before it becomes expensive? If the answer is only "it sounds futuristic," congratulations, we have invented a very expensive press release.`,
      ),
      makeLine(
        index % 2 === 0 ? "primary" : "secondary",
        `The source-backed example to hold onto is "${post.title}" from ${post.date}. The stored summary says: ${post.summary} The practical importance was: ${post.why_it_matters} That gives us a boundary. We can explain the implication, but we should not pretend the source proved every possible version of the claim. A good listener keeps the claim, the evidence, and the decision separate.`,
      ),
      makeLine(
        index % 2 === 0 ? "secondary" : "primary",
        `For a beginner, the concrete example is this: imagine using an AI tool as an assistant for one repeatable task. The first question is not "is it intelligent?" The first question is "can I check the result?" If you cannot check the result, the tool may still be interesting, but it is not ready to quietly take over work that matters. That is not anti-AI; that is pro-not-making-a-mess.`,
      ),
    );
  }

  lines.push(
    makeLine(
      "primary",
      `Now the intermediate layer. If you already know a little about APIs, queues, databases, and model calls, this week is about system boundaries. A model answer is only one part of a workflow. You still need input quality, retrieval or context, logging, retry behavior, evaluation, cost controls, and a way for a human to notice when the output is plausible but wrong. The glamorous part is the answer. The useful part is the boring machinery around the answer.`,
    ),
    makeLine(
      "secondary",
      `And the advanced layer is where the strategy gets interesting. The weekly digest points toward tradeoffs among capability, observability, cost, and trust. Once AI becomes infrastructure, the question is not simply which model is smartest today. It is which workflow can be evaluated, routed, monitored, rolled back, and paid for without turning into operational fog. The fog is where budgets go to disappear while everyone nods thoughtfully in a meeting.`,
    ),
    makeLine(
      "primary",
      `The market lens should be handled with restraint. ${digest.market_investment_lens} Notice the careful word there: lens. Not prediction, not recommendation, not a tiny crystal ball in a blazer. A market lens says where pressure may be building: infrastructure, workflow tooling, evaluation, developer experience, data access, or governance. It does not prove who wins.`,
    ),
    makeLine(
      "secondary",
      `The executive memo is similarly practical. ${digest.executive_insights_memo} A leader should turn that into a checklist: what task are we improving, what metric changes, what does review cost, what is the failure mode, and who owns the result? If nobody owns the result, the AI tool has not automated work. It has automated ambiguity.`,
    ),
  );

  for (const brief of digest.research_briefs.slice(0, 3)) {
    lines.push(
      makeLine(
        "primary",
        `Research expansion: ${brief.title}. The thesis is: ${brief.thesis} The right way to hear a research brief is not as a trivia segment. It is a map of what evidence exists, what it suggests, and what it absolutely does not settle.`,
      ),
      makeLine(
        "secondary",
        `The evidence listed was: ${formatList(brief.evidence)}. The implications were: ${formatList(brief.implications)}. The uncertainty was: ${brief.uncertainty} That uncertainty sentence is doing real work. It keeps the episode from turning one source-backed theme into a universal law, which would be convenient, dramatic, and wrong.`,
      ),
    );
  }

  lines.push(
    makeLine(
      "primary",
      `Let's turn the week into examples. A non-technical listener can use the same framework on almost any AI claim. First, restate the claim in plain language. Second, ask what source supports it. Third, ask what would happen if the claim were only half true. Fourth, pick one tiny experiment that would teach you something without requiring a procurement process, a steering committee, and a ceremonial spreadsheet.`,
    ),
    makeLine(
      "secondary",
      `For a technical listener, the experiment should include instrumentation from the beginning. Save inputs and outputs, write down failure cases, separate model errors from bad instructions, and estimate cost per useful result. Do not wait until the demo becomes a production dependency to discover that nobody logged enough to debug it. That is how "we moved fast" becomes "we moved fast into a wall."`,
    ),
    makeLine(
      "primary",
      `For an executive listener, the useful question is adoption quality. Are people using the tool because it creates measurable value, or because everyone is politely pretending the pilot is going great? Look for cycle time, rework, customer impact, learning speed, and risk reduction. If the only metric is "number of prompts sent," then the business case is basically confetti with a dashboard.`,
    ),
    makeLine(
      "secondary",
      `And for someone learning AI from the outside, the best path is still free and concrete. Pick one concept from the week, read an official explanation, watch a free walkthrough if needed, and build a tiny version. If the topic is evaluation, make a five-row scorecard. If the topic is retrieval, make a small notes search. If the topic is agents, diagram the loop: plan, act, observe, revise. Small beats mystical.`,
    ),
  );

  return lines;
}

function collectQuoteAnchors(digest: WeeklyDigestPayload) {
  const quotes: string[] = [];
  for (const reference of digest.source_references) {
    const rawQuotes = Array.isArray(reference.quotes) ? reference.quotes : [];
    for (const raw of rawQuotes) {
      if (typeof raw === "string" && raw.trim()) {
        quotes.push(raw.trim());
        continue;
      }
      if (raw && typeof raw === "object" && "quote" in raw) {
        const quote = raw.quote;
        if (typeof quote === "string" && quote.trim()) quotes.push(quote.trim());
      }
    }
  }
  return quotes.slice(0, 8);
}

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function formatList(items: string[]) {
  if (!items.length) return "no specific items were stored, so keep the next step conservative";
  if (items.length === 1) return items[0];
  return items.map((item, index) => `${index + 1}. ${item}`).join(" ");
}
