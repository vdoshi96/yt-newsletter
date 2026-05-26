export type TranscriptResult =
  | {
      status: "completed";
      source: "youtube_transcript_free";
      transcript_text: string;
      timed_segments: Array<{ offset: number; duration: number; text: string }>;
      derived_notes: null;
      needs_retry: false;
      retry_after: null;
    }
  | {
      status: "missing";
      source: "youtube_transcript_free";
      transcript_text: null;
      timed_segments: null;
      derived_notes: null;
      needs_retry: true;
      retry_after: string;
      failure_reason?: string;
    };

const DEFAULT_TRANSCRIPT_RETRY_MINUTES = 60;
const DEFAULT_TRANSCRIPT_FETCH_TIMEOUT_MS = 45_000;

type TranscriptSegment = { text: string; offset: number; duration: number };
type TranscriptFetcher = (videoId: string) => Promise<TranscriptSegment[]>;

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

export async function fetchFreeTranscript(videoId: string): Promise<TranscriptResult> {
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
