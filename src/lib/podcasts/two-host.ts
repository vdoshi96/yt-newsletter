import type { WeeklyDigestPayload } from "@/lib/digests/schemas";

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

export function buildTwoHostPodcastLines(digest: WeeklyDigestPayload): PodcastLine[] {
  const topics = digest.ranked_topics.slice(0, 3);
  const firstTopic = topics[0];
  const nextStep = digest.what_to_do_next[0] ?? digest.free_learning_plan[0];

  return compactLines([
    line("female_british", `Welcome back. This is the weekly creator briefing: ${digest.title}.`),
    line(
      "male_american",
      "We are keeping this practical and careful: what was actually in the digests, what is uncertain, and what a non-technical learner can do next.",
    ),
    line("female_british", digest.explanation_levels.beginner),
    line(
      "male_american",
      firstTopic
        ? `The lead topic is ${firstTopic.topic}. The reason it matters is: ${firstTopic.why_it_matters}`
        : "There was not enough source-backed material to rank a lead topic this week.",
    ),
    line("female_british", `At the intermediate level: ${digest.explanation_levels.intermediate}`),
    line("male_american", `What changed this week: ${digest.what_changed}`),
    ...topics.slice(1).flatMap((topic) => [
      line("female_british", `Another theme was ${topic.topic}.`),
      line("male_american", topic.why_it_matters),
    ]),
    line("female_british", `For advanced listeners: ${digest.explanation_levels.advanced}`),
    line(
      "male_american",
      nextStep
        ? `A useful free next step is: ${nextStep}`
        : "The safest next step is to read the daily digests and choose one small free exercise.",
    ),
    line(
      "female_british",
      "And the standing caveat: if the daily sources were partial or AI-derived, treat this as a guide to investigate, not as a final answer.",
    ),
    line("male_american", "That is the week. Keep the bar high, keep the costs low, and learn in public if you can."),
  ]);
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

function compactLines(lines: PodcastLine[]) {
  return lines.filter((line) => line.text.length > 0).map((line) => ({
    ...line,
    text: line.text.length > 700 ? `${line.text.slice(0, 697).trim()}...` : line.text,
  }));
}

function cleanLine(text: string) {
  return text.replace(/\s+/g, " ").trim();
}
