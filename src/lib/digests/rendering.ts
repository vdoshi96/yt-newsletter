import { isVerifiedTranscriptSource, minimumTranscriptCharacters } from "./grounding";

export type DailyDigestRenderRow = {
  grounding_status?: string | null;
  transcript_source?: string | null;
  transcript_length?: number | null;
  generation_model?: string | null;
  generated_at?: string | null;
  full_digest_json?: unknown;
};

export type WeeklyDigestRenderRow = {
  grounding_status?: string | null;
  source_digest_count?: number | null;
  generation_model?: string | null;
  generated_at?: string | null;
  full_digest_json?: unknown;
};

export function isGroundedDailyDigestRow(
  row: DailyDigestRenderRow,
  minTranscriptCharacters = minimumTranscriptCharacters(),
) {
  const jsonGrounding = readRecord(readRecord(row.full_digest_json)?.transcript_grounding);
  const transcriptSource =
    row.transcript_source ?? readString(jsonGrounding?.transcript_source);
  const transcriptLength =
    row.transcript_length ?? readNumber(jsonGrounding?.transcript_length) ?? 0;
  const generationModel =
    row.generation_model ?? readString(jsonGrounding?.generation_model);
  const generatedAt =
    row.generated_at ?? readString(jsonGrounding?.generation_timestamp);

  return (
    Boolean(transcriptSource && isVerifiedTranscriptSource(transcriptSource)) &&
    transcriptLength >= minTranscriptCharacters &&
    Boolean(generationModel) &&
    Boolean(generatedAt) &&
    generatedAt !== "unknown" &&
    (row.grounding_status === "grounded" || row.grounding_status == null)
  );
}

export function isFinalWeeklyDigestRow(row: WeeklyDigestRenderRow) {
  const fullJson = readRecord(row.full_digest_json);
  if (fullJson?.baseline_placeholder === true) return false;

  const grounding = readRecord(fullJson?.weekly_grounding);
  const grounded =
    row.grounding_status === "grounded" || readBoolean(grounding?.grounded) === true;
  const sourceDigestCount =
    row.source_digest_count ?? readNumber(grounding?.source_digest_count) ?? 0;
  const generationModel = row.generation_model ?? readString(grounding?.generation_model);
  const generatedAt = row.generated_at ?? readString(grounding?.generated_at);

  return grounded && sourceDigestCount > 0 && Boolean(generationModel) && Boolean(generatedAt);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}
