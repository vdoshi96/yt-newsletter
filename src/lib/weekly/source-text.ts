import {
  normalizeExplanationLevels,
  type ExplanationLevels,
} from "../digests/explanation-levels";

export type WeeklySourceDigest = {
  title: string;
  front_page_summary: string;
  plain_english_explanation: string;
  explanation_levels?: Partial<ExplanationLevels> | null;
  full_digest_json?: unknown;
  why_it_matters: string;
  digest_date: string;
};

export function buildWeeklySourceText(digests: WeeklySourceDigest[]) {
  return digests
    .map((digest) => {
      const levels = resolveDailyExplanationLevels(digest);
      return [
        `Date: ${digest.digest_date}`,
        `Title: ${digest.title}`,
        `Summary: ${digest.front_page_summary}`,
        `Beginner explanation: ${levels.beginner}`,
        `Intermediate explanation: ${levels.intermediate}`,
        `Advanced explanation: ${levels.advanced}`,
        `Why it matters: ${digest.why_it_matters}`,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

function resolveDailyExplanationLevels(digest: WeeklySourceDigest) {
  const fromFullJson = readLevelsFromUnknown(digest.full_digest_json);
  return normalizeExplanationLevels(
    fromFullJson ?? digest.explanation_levels,
    digest.plain_english_explanation,
  );
}

function readLevelsFromUnknown(value: unknown): Partial<ExplanationLevels> | null {
  if (!isRecord(value)) return null;
  const levels = value.explanation_levels;
  if (!isRecord(levels)) return null;
  return {
    beginner: typeof levels.beginner === "string" ? levels.beginner : undefined,
    intermediate: typeof levels.intermediate === "string" ? levels.intermediate : undefined,
    advanced: typeof levels.advanced === "string" ? levels.advanced : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
