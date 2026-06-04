import type { VerifiedTranscriptSource } from "@/lib/digests/grounding";

export type TranscriptResult =
  | {
      status: "completed";
      source: VerifiedTranscriptSource;
      transcript_text: string;
      timed_segments: Array<{ offset: number; duration: number; text: string }>;
      derived_notes: null;
      needs_retry: false;
      retry_after: null;
    }
  | {
      status: "missing";
      source: VerifiedTranscriptSource;
      transcript_text: null;
      timed_segments: null;
      derived_notes: null;
      needs_retry: true;
      retry_after: string;
      failure_reason?: string;
    };

const DEFAULT_TRANSCRIPT_RETRY_MINUTES = 60;
const DEFAULT_TRANSCRIPT_FETCH_TIMEOUT_MS = 45_000;
const DEFAULT_TRANSCRIPT_API_BASE_URL =
  "https://transcriptapi.com/api/v2/youtube/transcript";

type TranscriptSegment = { text: string; offset: number; duration: number };
type TranscriptFetcher = (videoId: string) => Promise<TranscriptSegment[]>;
type TranscriptApiResponse = Record<string, unknown>;

class TranscriptFetchError extends Error {
  retryable = true;

  constructor(
    message: string,
    public reason: string,
  ) {
    super(message);
    this.name = "TranscriptFetchError";
  }
}

export function transcriptRetryDelayMs() {
  const configuredMinutes = Number(process.env.TRANSCRIPT_RETRY_MINUTES);
  const minutes =
    Number.isFinite(configuredMinutes) && configuredMinutes > 0
      ? configuredMinutes
      : DEFAULT_TRANSCRIPT_RETRY_MINUTES;

  return minutes * 60 * 1000;
}

export function transcriptFetchTimeoutMs() {
  const configuredMs = Number(process.env.TRANSCRIPT_FETCH_TIMEOUT_MS);
  return Number.isFinite(configuredMs) && configuredMs > 0
    ? configuredMs
    : DEFAULT_TRANSCRIPT_FETCH_TIMEOUT_MS;
}

export async function fetchTranscriptWithTimeout(
  videoId: string,
  fetcher: TranscriptFetcher,
  timeoutMs = transcriptFetchTimeoutMs(),
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetcher(videoId),
      new Promise<TranscriptSegment[]>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(
            new TranscriptFetchError(
              `Transcript fetch timed out after ${timeoutMs}ms.`,
              "timeout",
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs = transcriptFetchTimeoutMs(),
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new TranscriptFetchError(`Transcript API request failed: HTTP ${response.status}.`, "api_error");
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new TranscriptFetchError(
        `Transcript API request timed out after ${timeoutMs}ms.`,
        "timeout",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function classifyTranscriptFetchError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const candidate = error as Partial<TranscriptFetchError>;
  const lowerMessage = message.toLowerCase();
  const reason =
    typeof candidate.reason === "string"
      ? candidate.reason
      : lowerMessage.includes("timeout") || lowerMessage.includes("timed out")
        ? "timeout"
        : lowerMessage.includes("no transcript") ||
            lowerMessage.includes("transcript disabled") ||
            lowerMessage.includes("transcript is disabled")
          ? "not_available"
          : "fetch_error";

  return {
    reason,
    retryable: typeof candidate.retryable === "boolean" ? candidate.retryable : true,
    message,
  };
}

export async function fetchFreeTranscript(
  videoId: string,
  options: { allowManagedFallback?: boolean } = {},
): Promise<TranscriptResult> {
  try {
    const mod = (await import("youtube-transcript")) as {
      YoutubeTranscript?: {
        fetchTranscript: TranscriptFetcher;
      };
    };
    const transcript = await fetchTranscriptWithTimeout(videoId, (youtubeVideoId) =>
      mod.YoutubeTranscript?.fetchTranscript(youtubeVideoId) ?? Promise.resolve([]),
    );
    if (!transcript?.length) throw new Error("No transcript found.");

    return {
      status: "completed",
      source: "youtube_transcript_free",
      transcript_text: transcript.map((segment) => segment.text).join("\n"),
      timed_segments: transcript,
      derived_notes: null,
      needs_retry: false,
      retry_after: null,
    };
  } catch (error) {
    const failure = classifyTranscriptFetchError(error);
    console.warn("[ingest:transcript-fetch-failed]", {
      youtubeVideoId: videoId,
      reason: failure.reason,
      retryable: failure.retryable,
      message: failure.message,
    });
    if (options.allowManagedFallback) {
      const managedTranscript = await fetchTranscriptApiTranscript(videoId);
      if (managedTranscript.status === "completed") return managedTranscript;
    }
    const retryAfter = new Date(Date.now() + transcriptRetryDelayMs());
    return {
      status: "missing",
      source: "youtube_transcript_free",
      transcript_text: null,
      timed_segments: null,
      derived_notes: null,
      needs_retry: true,
      retry_after: retryAfter.toISOString(),
      failure_reason: failure.reason,
    };
  }
}

async function fetchTranscriptApiTranscript(videoId: string): Promise<TranscriptResult> {
  const apiKey = process.env.TRANSCRIPT_API_KEY ?? process.env.API_KEY;
  if (!apiKey) {
    return missingTranscript(videoId, "missing_api_key");
  }

  try {
    const url = new URL(process.env.TRANSCRIPT_API_BASE_URL ?? DEFAULT_TRANSCRIPT_API_BASE_URL);
    url.searchParams.set("video_url", `https://www.youtube.com/watch?v=${videoId}`);
    url.searchParams.set("format", "json");
    const data = await fetchJsonWithTimeout<TranscriptApiResponse>(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const normalized = normalizeTranscriptApiResponse(data);
    if (!normalized.transcriptText.trim()) {
      throw new TranscriptFetchError("Transcript API returned an empty transcript.", "not_available");
    }
    return {
      status: "completed",
      source: "transcriptapi_com",
      transcript_text: normalized.transcriptText,
      timed_segments: normalized.timedSegments,
      derived_notes: null,
      needs_retry: false,
      retry_after: null,
    };
  } catch (error) {
    const failure = classifyTranscriptFetchError(error);
    console.warn("[ingest:managed-transcript-fetch-failed]", {
      youtubeVideoId: videoId,
      reason: failure.reason,
      retryable: failure.retryable,
      message: failure.message,
    });
    return missingTranscript(videoId, failure.reason);
  }
}

function normalizeTranscriptApiResponse(data: TranscriptApiResponse) {
  const record = readRecord(data);
  const nested = readRecord(record.data);
  const transcriptCandidate =
    record.transcript ??
    nested?.transcript ??
    record.segments ??
    nested?.segments ??
    record.captions ??
    nested?.captions;
  const fullText =
    readString(record.full_text) ??
    readString(nested?.full_text) ??
    readString(record.text) ??
    readString(nested?.text);

  if (typeof transcriptCandidate === "string") {
    return { transcriptText: transcriptCandidate.trim(), timedSegments: [] };
  }

  if (!Array.isArray(transcriptCandidate)) {
    return { transcriptText: fullText?.trim() ?? "", timedSegments: [] };
  }

  const segments: TranscriptSegment[] = [];
  const lines: string[] = [];
  for (const item of transcriptCandidate) {
    if (typeof item === "string") {
      const text = item.trim();
      if (text) lines.push(text);
      continue;
    }
    const itemRecord = readRecord(item);
    const text =
      readString(itemRecord.text) ??
      readString(itemRecord.value) ??
      readString(itemRecord.caption) ??
      readString(itemRecord.transcript);
    if (!text) continue;
    const offset = secondsToMilliseconds(
      readTimestamp(itemRecord.offset) ??
        readTimestamp(itemRecord.start) ??
        readTimestamp(itemRecord.start_time) ??
        readTimestamp(itemRecord.startTime) ??
        0,
    );
    const duration = secondsToMilliseconds(
      readTimestamp(itemRecord.duration) ??
        durationFromStartEnd(itemRecord.start, itemRecord.end) ??
        durationFromStartEnd(itemRecord.startTime, itemRecord.endTime) ??
        0,
    );
    lines.push(text);
    segments.push({ text, offset, duration });
  }

  return {
    transcriptText: fullText?.trim() || lines.join("\n"),
    timedSegments: segments,
  };
}

function missingTranscript(videoId: string, failureReason?: string): TranscriptResult {
  const retryAfter = new Date(Date.now() + transcriptRetryDelayMs());
  return {
    status: "missing",
    source: "youtube_transcript_free",
    transcript_text: null,
    timed_segments: null,
    derived_notes: null,
    needs_retry: true,
    retry_after: retryAfter.toISOString(),
    failure_reason: failureReason,
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return numeric;
  const parts = trimmed.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function durationFromStartEnd(start: unknown, end: unknown) {
  const startSeconds = readTimestamp(start);
  const endSeconds = readTimestamp(end);
  if (startSeconds === null || endSeconds === null || endSeconds <= startSeconds) return null;
  return endSeconds - startSeconds;
}

function secondsToMilliseconds(seconds: number) {
  return Math.max(0, Math.round(seconds * 1000));
}
