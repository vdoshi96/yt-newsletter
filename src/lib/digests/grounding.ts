import type { ChatMessage } from "@/lib/ai/types";

export const VERIFIED_TRANSCRIPT_SOURCES = ["youtube_transcript_free"] as const;

export type VerifiedTranscriptSource = (typeof VERIFIED_TRANSCRIPT_SOURCES)[number];

export type TranscriptSegment = {
  offset: number;
  duration: number;
  text: string;
};

export type DailyDigestTranscriptRecord = {
  id?: string | null;
  video_id: string;
  source: string;
  status: string;
  transcript_text: string | null;
  timed_segments?: TranscriptSegment[] | string | null;
  derived_notes?: unknown | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
};

export type VerifiedDailyDigestTranscript = Omit<
  DailyDigestTranscriptRecord,
  "source" | "status" | "transcript_text" | "timed_segments"
> & {
  source: VerifiedTranscriptSource;
  status: "completed";
  transcript_text: string;
  timed_segments: TranscriptSegment[];
  transcript_character_count: number;
  source_recorded_at: string;
};

export type TranscriptGroundingMetadata = {
  transcript_source: VerifiedTranscriptSource;
  transcript_length: number;
  video_id: string;
  transcript_id?: string;
  transcript_recorded_at: string;
  generation_timestamp: string;
  generation_model?: string;
  regenerated_after_hallucination_fix?: boolean;
  key_excerpts: Array<{
    timestamp?: string;
    quote: string;
    note: string;
  }>;
};

const DEFAULT_MIN_TRANSCRIPT_CHARACTERS = 1200;
const PLACEHOLDER_PATTERNS = [
  /transcript unavailable/i,
  /no transcript (?:found|available)/i,
  /captions? (?:disabled|unavailable)/i,
  /unable to (?:fetch|retrieve|access) (?:the )?transcript/i,
  /summary is based on the video title/i,
  /based on .*general knowledge/i,
];

export function minimumTranscriptCharacters() {
  const configured = Number(process.env.DAILY_DIGEST_MIN_TRANSCRIPT_CHARS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_MIN_TRANSCRIPT_CHARACTERS;
}

export function validateTranscriptForDailyDigest(input: {
  expectedVideoId: string;
  transcript: DailyDigestTranscriptRecord | null | undefined;
  minTranscriptCharacters?: number;
}): VerifiedDailyDigestTranscript {
  const transcript = input.transcript;
  if (!transcript) {
    throw new Error("A verified transcript is required before daily digest generation.");
  }
  if (transcript.video_id !== input.expectedVideoId) {
    throw new Error(
      `Transcript video_id ${transcript.video_id} does not match expected video_id ${input.expectedVideoId}.`,
    );
  }
  if (transcript.status !== "completed") {
    throw new Error(`Transcript status ${transcript.status} is not completed.`);
  }
  if (!isVerifiedTranscriptSource(transcript.source)) {
    throw new Error(
      `Transcript source ${transcript.source} is not an allowed verified transcript source.`,
    );
  }

  const transcriptText = transcript.transcript_text?.trim() ?? "";
  if (!transcriptText) {
    throw new Error("Verified transcript text is required before daily digest generation.");
  }
  const minCharacters = input.minTranscriptCharacters ?? minimumTranscriptCharacters();
  if (transcriptText.length < minCharacters) {
    throw new Error(
      `Verified transcript is too short for daily digest generation: ${transcriptText.length} characters, minimum ${minCharacters}.`,
    );
  }
  if (looksLikePlaceholderTranscript(transcriptText)) {
    throw new Error("Verified transcript appears to be placeholder or unavailable text.");
  }
  const sourceRecordedAt = transcript.created_at ?? transcript.updated_at;
  if (!sourceRecordedAt) {
    throw new Error("Verified transcript source timestamp is required before daily digest generation.");
  }
  const timedSegments = normalizeTranscriptSegments(transcript.timed_segments);

  return {
    ...transcript,
    source: transcript.source,
    status: "completed",
    transcript_text: transcriptText,
    timed_segments: timedSegments,
    transcript_character_count: transcriptText.length,
    source_recorded_at: normalizeTimestamp(sourceRecordedAt),
  };
}

export function buildDailyDigestMessages(input: {
  prompt: string;
  videoId: string;
  transcript: DailyDigestTranscriptRecord | null | undefined;
  previousDailyContext?: string;
  minTranscriptCharacters?: number;
}): ChatMessage[] {
  const verified = validateTranscriptForDailyDigest({
    expectedVideoId: input.videoId,
    transcript: input.transcript,
    minTranscriptCharacters: input.minTranscriptCharacters,
  });
  const anchors = formatTranscriptAnchors(verified.timed_segments);

  return [
    {
      role: "system",
      content:
        "You are a careful newspaper editor. Return strict JSON only. Every factual claim must be grounded only in the verified transcript supplied by the user.",
    },
    {
      role: "user",
      content: [
        input.prompt,
        "SOURCE RULES:",
        "- Use only the VERIFIED TRANSCRIPT and TIMED TRANSCRIPT ANCHORS below.",
        "- Do not use the video title, description, thumbnail, channel metadata, prior knowledge, or search results as evidence.",
        "- If the transcript does not support a claim, omit the claim.",
        "- Include exact transcript quote anchors in source_notes whenever possible.",
        "",
        "VERIFIED TRANSCRIPT METADATA:",
        `video_id: ${verified.video_id}`,
        `transcript_id: ${verified.id ?? "unknown"}`,
        `source: ${verified.source}`,
        `transcript_characters: ${verified.transcript_character_count}`,
        `source_recorded_at: ${verified.source_recorded_at}`,
        "",
        "TIMED TRANSCRIPT ANCHORS:",
        anchors || "No timed segment anchors were stored; use exact quotes from the transcript text.",
        "",
        "VERIFIED TRANSCRIPT:",
        verified.transcript_text,
      ].join("\n"),
    },
  ];
}

export function buildTranscriptGroundingMetadata(input: {
  transcript: VerifiedDailyDigestTranscript;
  generationTimestamp: string;
  generationModel?: string;
  sourceNotes?: Array<{ timestamp?: string | null; quote?: string; note: string }>;
  regeneratedAfterHallucinationFix?: boolean;
}): TranscriptGroundingMetadata {
  const sourceNoteExcerpts =
    input.sourceNotes
      ?.filter((note) => note.quote?.trim())
      .slice(0, 6)
      .map((note) => ({
        timestamp: note.timestamp ?? undefined,
        quote: note.quote!.trim(),
        note: note.note,
      })) ?? [];

  const keyExcerpts = sourceNoteExcerpts.length
    ? sourceNoteExcerpts
    : input.transcript.timed_segments.slice(0, 4).map((segment) => ({
        timestamp: formatTimestampRange(segment),
        quote: segment.text.trim(),
        note: "Stored transcript segment used as a grounding anchor.",
      }));

  return {
    transcript_source: input.transcript.source,
    transcript_length: input.transcript.transcript_character_count,
    video_id: input.transcript.video_id,
    transcript_id: input.transcript.id ?? undefined,
    transcript_recorded_at: input.transcript.source_recorded_at,
    generation_timestamp: input.generationTimestamp,
    generation_model: input.generationModel,
    regenerated_after_hallucination_fix: input.regeneratedAfterHallucinationFix || undefined,
    key_excerpts: keyExcerpts,
  };
}

export function assertDailyDigestGrounding(input: {
  transcriptText: string;
  digest: {
    source_notes?: Array<{ timestamp?: string | null; quote?: string; note: string }>;
    what_creator_said?: string[];
  };
}) {
  const normalizedTranscript = normalizeForMatching(input.transcriptText);
  const quoteNotes = input.digest.source_notes?.filter((note) => note.quote?.trim()) ?? [];
  if (!quoteNotes.length) {
    throw new Error("Daily digest grounding failed: at least one source note quote is required.");
  }

  const matchedQuotes = quoteNotes.filter((note) => {
    const quote = normalizeForMatching(note.quote ?? "");
    return quote.length >= 18 && normalizedTranscript.includes(quote);
  });
  if (!matchedQuotes.length) {
    throw new Error("Daily digest grounding failed: no source note quote appears in transcript.");
  }

  const unsupportedClaims = (input.digest.what_creator_said ?? []).filter(
    (claim) => !hasTranscriptVocabularyOverlap(claim, normalizedTranscript),
  );
  if (unsupportedClaims.length) {
    throw new Error(
      `Daily digest grounding failed: creator claim is not supported by transcript vocabulary: ${unsupportedClaims[0]}`,
    );
  }
}

export function looksLikePlaceholderTranscript(text: string) {
  const normalized = text.trim();
  if (!normalized) return true;
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  const withoutNoise = normalized
    .replace(/\[(music|applause|laughter|silence|foreign)\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const letters = withoutNoise.match(/[a-z]/gi)?.length ?? 0;
  return letters < 80;
}

function isVerifiedTranscriptSource(source: string): source is VerifiedTranscriptSource {
  return VERIFIED_TRANSCRIPT_SOURCES.includes(source as VerifiedTranscriptSource);
}

function normalizeTranscriptSegments(
  value: DailyDigestTranscriptRecord["timed_segments"],
): TranscriptSegment[] {
  const parsed = typeof value === "string" ? parseJsonArray(value) : value;
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((segment) => {
    if (!segment || typeof segment !== "object") return [];
    const record = segment as Partial<Record<keyof TranscriptSegment, unknown>>;
    const text = typeof record.text === "string" ? record.text.trim() : "";
    if (!text) return [];
    const offset = Number(record.offset);
    const duration = Number(record.duration);
    return [
      {
        offset: Number.isFinite(offset) ? offset : 0,
        duration: Number.isFinite(duration) ? duration : 0,
        text,
      },
    ];
  });
}

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatTranscriptAnchors(segments: TranscriptSegment[]) {
  if (!segments.length) return "";
  const step = Math.max(1, Math.floor(segments.length / 18));
  return segments
    .filter((segment, index) => index === 0 || index % step === 0)
    .slice(0, 24)
    .map((segment) => `[${formatTimestampRange(segment)}] ${segment.text}`)
    .join("\n");
}

function formatTimestampRange(segment: TranscriptSegment) {
  const start = secondsToTimestamp(segment.offset / 1000);
  const end = secondsToTimestamp((segment.offset + segment.duration) / 1000);
  return `${start}-${end}`;
}

function secondsToTimestamp(seconds: number) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function normalizeTimestamp(value: string | Date) {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeForMatching(value: string) {
  return value
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTranscriptVocabularyOverlap(claim: string, normalizedTranscript: string) {
  const terms = significantTerms(claim);
  if (!terms.length) return true;
  const hits = terms.filter((term) => normalizedTranscript.includes(term)).length;
  return hits >= Math.min(3, terms.length) || hits / terms.length >= 0.45;
}

function significantTerms(value: string) {
  const stopwords = new Set([
    "about",
    "after",
    "again",
    "because",
    "before",
    "being",
    "could",
    "creator",
    "discussed",
    "explained",
    "from",
    "have",
    "into",
    "most",
    "that",
    "their",
    "there",
    "these",
    "this",
    "through",
    "with",
    "would",
  ]);
  return Array.from(new Set(normalizeForMatching(value).split(" "))).filter(
    (term) => term.length >= 5 && !stopwords.has(term),
  );
}
