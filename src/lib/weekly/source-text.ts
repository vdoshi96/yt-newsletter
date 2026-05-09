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
      const grounding = readTranscriptGroundingFromUnknown(digest.full_digest_json);
      const quotes = readSourceQuotesFromUnknown(digest.full_digest_json);
      return [
        `Date: ${digest.digest_date}`,
        `Title: ${digest.title}`,
        `Summary: ${digest.front_page_summary}`,
        `Beginner explanation: ${levels.beginner}`,
        `Intermediate explanation: ${levels.intermediate}`,
        `Advanced explanation: ${levels.advanced}`,
        `Why it matters: ${digest.why_it_matters}`,
        grounding
          ? [
              `Transcript source: ${grounding.transcriptSource}`,
              `Transcript length: ${grounding.transcriptLength}`,
              `Model: ${grounding.generationModel ?? "unknown"}`,
            ].join("\n")
          : "Transcript source: unavailable",
        quotes.length
          ? ["Transcript quote anchors:", ...quotes.map((quote) => `Quote: ${quote}`)].join("\n")
          : "Transcript quote anchors: unavailable",
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

function readTranscriptGroundingFromUnknown(value: unknown) {
  if (!isRecord(value)) return null;
  const grounding = value.transcript_grounding;
  if (!isRecord(grounding)) return null;
  const transcriptSource = readString(grounding.transcript_source);
  const transcriptLength = readNumber(grounding.transcript_length);
  if (!transcriptSource || transcriptLength === null) return null;
  return {
    transcriptSource,
    transcriptLength,
    generationModel: readString(grounding.generation_model),
  };
}

function readSourceQuotesFromUnknown(value: unknown) {
  if (!isRecord(value)) return [];
  const sourceNotes = Array.isArray(value.source_notes) ? value.source_notes : [];
  const grounding = isRecord(value.transcript_grounding) ? value.transcript_grounding : null;
  const groundingExcerpts = grounding && Array.isArray(grounding.key_excerpts)
    ? grounding.key_excerpts
    : [];

  return [...sourceNotes, ...groundingExcerpts]
    .map((note) => (isRecord(note) ? readString(note.quote) : null))
    .filter((quote): quote is string => Boolean(quote))
    .slice(0, 6);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
