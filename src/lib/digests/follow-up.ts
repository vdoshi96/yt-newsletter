export type DailyFollowUpDigest = {
  digestDate: string;
  title: string;
  frontPageSummary: string;
  whyItMatters?: string;
};

export function buildDailyFollowUp(input: {
  current: DailyFollowUpDigest;
  previous: DailyFollowUpDigest[];
}) {
  const previous = [...input.previous].sort((a, b) => b.digestDate.localeCompare(a.digestDate));
  if (!previous.length) return "No prior daily digest is available for this creator yet.";

  const yesterday = previous.filter(
    (digest) => digest.digestDate === previousDate(input.current.digestDate),
  );
  if (yesterday.length === 1) {
    const digest = yesterday[0];
    return (
      `Yesterday's edition covered ${sentenceTitle(digest.title)}. ` +
      `Key context: ${summarizePrior(digest)} ` +
      `Today's edition covers ${sentenceTitle(input.current.title)}. Use yesterday as background, contrast, or a theme shift rather than treating today's story as standalone.`
    );
  }

  if (yesterday.length > 1) {
    return (
      `Yesterday had ${yesterday.length} editions: ${yesterday.map((digest) => sentenceTitle(digest.title)).join("; ")}. ` +
      `Together, they set up today's edition on ${sentenceTitle(input.current.title)} by giving you the prior concepts and tradeoffs to compare against.`
    );
  }

  const latest = previous[0];
  return (
    `No digest was stored yesterday. The latest prior edition was ${latest.digestDate}, ` +
    `${sentenceTitle(latest.title)}. Use that as the nearest context: ${summarizePrior(latest)}`
  );
}

function previousDate(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

function summarizePrior(digest: DailyFollowUpDigest) {
  const source = digest.whyItMatters ?? digest.frontPageSummary;
  return truncate(source, 180);
}

function truncate(value: string, maxLength: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trim()}...`;
}

function sentenceTitle(title: string) {
  return title.trim().replace(/[.!?]+$/g, "");
}
