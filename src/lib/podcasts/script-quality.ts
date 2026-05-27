import type { WeeklyDigestPayload } from "@/lib/digests/schemas";
import {
  getPodcastTargetWordCount,
  type PodcastScriptConfig,
} from "./config";
import {
  buildTwoHostPodcastLines,
  formatTwoHostPodcastScript,
  type PodcastHostCast,
  type PodcastHostKey,
  type PodcastLine,
} from "./two-host";

export type PodcastScriptSource =
  | "stored"
  | "provider"
  | "deterministic_fallback";

export type PodcastScriptResolution = {
  script: string;
  lines: PodcastLine[];
  wordCount: number;
  minimumWordCount: number;
  source: PodcastScriptSource;
  replacedShortScript: boolean;
  originalWordCount: number | null;
};

export function resolvePodcastScript(input: {
  candidateScript: string | null | undefined;
  candidateSource: Exclude<PodcastScriptSource, "deterministic_fallback">;
  digest: WeeklyDigestPayload;
  config: PodcastScriptConfig;
  cast: PodcastHostCast;
}): PodcastScriptResolution {
  const candidate = input.candidateScript?.trim();
  const minimumWordCount = getMinimumPodcastScriptWordCount(input.config);
  const originalWordCount = candidate ? countPodcastWords(candidate) : null;

  if (candidate && originalWordCount !== null && originalWordCount >= minimumWordCount) {
    return {
      script: candidate,
      lines: parsePodcastScriptToLines(candidate, input.cast, input.digest, input.config),
      wordCount: originalWordCount,
      minimumWordCount,
      source: input.candidateSource,
      replacedShortScript: false,
      originalWordCount,
    };
  }

  const lines = buildTwoHostPodcastLines(input.digest, input.config, input.cast);
  const script = formatTwoHostPodcastScript(lines);
  return {
    script,
    lines,
    wordCount: countPodcastWords(script),
    minimumWordCount,
    source: "deterministic_fallback",
    replacedShortScript: Boolean(candidate),
    originalWordCount,
  };
}

export function parsePodcastScriptToLines(
  script: string,
  cast: PodcastHostCast,
  digest: WeeklyDigestPayload,
  config: PodcastScriptConfig,
) {
  const parsed = parseStoredPodcastScript(script, cast);
  return parsed.length ? parsed : buildTwoHostPodcastLines(digest, config, cast);
}

export function getMinimumPodcastScriptWordCount(config: PodcastScriptConfig) {
  return Math.max(700, Math.round(getPodcastTargetWordCount(config) * 0.9));
}

export function countPodcastWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function parseStoredPodcastScript(script: string, cast: PodcastHostCast): PodcastLine[] {
  const hostByName = new Map<string, PodcastHostKey>([
    [cast.hosts.primary.name.toLowerCase(), "primary"],
    [cast.hosts.secondary.name.toLowerCase(), "secondary"],
  ]);
  const paragraphs = script
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  let fallbackHost: PodcastHostKey = "primary";
  return paragraphs.map((paragraph, index) => {
    const match = paragraph.match(/^(?:\*\*)?([A-Za-z][A-Za-z\s'-]{0,40})(?:\*\*)?:\s*([\s\S]+)$/);
    const parsedHost = match ? hostByName.get(match[1].trim().toLowerCase()) : undefined;
    const host = parsedHost ?? fallbackHost;
    const text = (match?.[2] ?? paragraph).trim();
    fallbackHost = host === "primary" ? "secondary" : "primary";
    return {
      host,
      hostName: cast.hosts[host].name,
      section: inferPodcastSection(text, index, paragraphs.length),
      pauseAfterMs: text.includes("[pause]") || text.includes("[beat]") ? 900 : undefined,
      text,
    };
  });
}

function inferPodcastSection(
  text: string,
  index: number,
  total: number,
): PodcastLine["section"] {
  const lower = text.toLowerCase();
  if (index <= 1) return "cold_open";
  if (lower.includes("source") || lower.includes("grounded")) return "source_contract";
  if (lower.includes("market") || lower.includes("executive") || lower.includes("board")) {
    return "market";
  }
  if (lower.includes("research") || lower.includes("evidence")) return "research";
  if (lower.includes("takeaway") || lower.includes("try this") || lower.includes("next step")) {
    return "practical";
  }
  if (lower.includes("uncertain") || lower.includes("uncertainty") || lower.includes("caveat")) {
    return "uncertainty";
  }
  if (index >= total - 2 || lower.includes("that is the week")) return "closing";
  return "topic";
}
