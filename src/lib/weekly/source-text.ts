import {
  normalizeExplanationLevels,
  type ExplanationLevels,
} from "../digests/explanation-levels";
import { VERIFIED_TRANSCRIPT_SOURCES } from "../digests/grounding";

export type WeeklySourceDigest = {
  video_id?: string | null;
  transcript_id?: string | null;
  transcript_source?: string | null;
  transcript_length?: number | null;
  title: string;
  front_page_summary: string;
  plain_english_explanation: string;
  explanation_levels?: Partial<ExplanationLevels> | null;
  full_digest_json?: unknown;
  why_it_matters: string;
  digest_date: string;
};

export type WeeklySourceReference = {
  date: string;
  label: string;
  note: string;
  video_id?: string;
  transcript_id?: string;
  transcript_source?: string;
  transcript_length?: number;
  generation_model?: string;
  quotes: Array<{
    timestamp?: string;
    quote: string;
  }>;
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

export function buildWeeklySourceReferences(
  digests: WeeklySourceDigest[],
): WeeklySourceReference[] {
  return digests.map((digest) => {
    const grounding = readTranscriptGroundingFromUnknown(digest.full_digest_json);
    const quotes = readSourceQuoteRecordsFromUnknown(digest.full_digest_json);
    return {
      date: digest.digest_date,
      label: `Daily digest: ${digest.title}`,
      note: "Transcript-grounded daily digest used as source material.",
      video_id: digest.video_id ?? grounding?.videoId ?? undefined,
      transcript_id: digest.transcript_id ?? grounding?.transcriptId ?? undefined,
      transcript_source: digest.transcript_source ?? grounding?.transcriptSource ?? undefined,
      transcript_length: digest.transcript_length ?? grounding?.transcriptLength ?? undefined,
      generation_model: grounding?.generationModel ?? undefined,
      quotes,
    };
  });
}

export function assertWeeklyDigestGrounding(input: {
  sourceText: string;
  digest: {
    weekly_posts?: Array<{ date?: string; title?: string }>;
    source_notes?: Array<{ date?: string; label?: string; note?: string }>;
  };
}) {
  const sourceDates = new Set(readLabeledLines(input.sourceText, "Date"));
  const sourceTitles = readLabeledLines(input.sourceText, "Title");
  if (!sourceDates.size) {
    throw new Error("Weekly digest grounding failed: no grounded daily source dates were supplied.");
  }
  const hasVerifiedTranscriptSource = VERIFIED_TRANSCRIPT_SOURCES.some((source) =>
    input.sourceText.includes(`Transcript source: ${source}`),
  );
  if (!hasVerifiedTranscriptSource) {
    throw new Error("Weekly digest grounding failed: daily transcript grounding metadata is missing.");
  }

  for (const post of input.digest.weekly_posts ?? []) {
    if (post.date && !sourceDates.has(post.date)) {
      throw new Error(
        `Weekly digest grounding failed: post date ${post.date} is outside the grounded daily source dates.`,
      );
    }
  }

  const sourceNotes = input.digest.source_notes ?? [];
  if (!sourceNotes.length) {
    throw new Error("Weekly digest grounding failed: at least one source note is required.");
  }

  for (const note of sourceNotes) {
    if (note.date && !sourceDates.has(note.date)) {
      throw new Error(
        `Weekly digest grounding failed: source note date ${note.date} is outside the grounded daily source dates.`,
      );
    }
    const label = note.label?.replace(/^Daily digest:\s*/i, "").trim();
    if (
      label &&
      sourceTitles.length &&
      !sourceTitles.some((title) => normalizedIncludes(title, label)) &&
      !normalizedIncludes(input.sourceText, label)
    ) {
      throw new Error(
        `Weekly digest grounding failed: source note label "${note.label}" is not present in grounded daily source text.`,
      );
    }
  }
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
    videoId: readString(grounding.video_id),
    transcriptId: readString(grounding.transcript_id),
    transcriptSource,
    transcriptLength,
    generationModel: readString(grounding.generation_model),
  };
}

function readSourceQuotesFromUnknown(value: unknown) {
  return readSourceQuoteRecordsFromUnknown(value).map((record) => record.quote);
}

function readSourceQuoteRecordsFromUnknown(value: unknown): Array<{
  timestamp?: string;
  quote: string;
}> {
  if (!isRecord(value)) return [];
  const sourceNotes = Array.isArray(value.source_notes) ? value.source_notes : [];
  const grounding = isRecord(value.transcript_grounding) ? value.transcript_grounding : null;
  const groundingExcerpts = grounding && Array.isArray(grounding.key_excerpts)
    ? grounding.key_excerpts
    : [];

  return [...sourceNotes, ...groundingExcerpts]
    .flatMap((note) => {
      if (!isRecord(note)) return [];
      const quote = readString(note.quote);
      if (!quote) return [];
      return [{
        timestamp: readString(note.timestamp) ?? undefined,
        quote,
      }];
    })
    .slice(0, 6);
}

function readLabeledLines(sourceText: string, label: string) {
  const pattern = new RegExp(`^${label}:\\s*(.+)$`, "gm");
  return [...sourceText.matchAll(pattern)].map((match) => match[1].trim()).filter(Boolean);
}

function normalizedIncludes(haystack: string, needle: string) {
  return normalizeForMatch(haystack).includes(normalizeForMatch(needle));
}

function normalizeForMatch(value: string) {
  return value.toLowerCase().replace(/[^\p{Letter}\p{Number}\s]/gu, " ").replace(/\s+/g, " ").trim();
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
