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
    };

const DEFAULT_TRANSCRIPT_RETRY_MINUTES = 60;

export function transcriptRetryDelayMs() {
  const configuredMinutes = Number(process.env.TRANSCRIPT_RETRY_MINUTES);
  const minutes =
    Number.isFinite(configuredMinutes) && configuredMinutes > 0
      ? configuredMinutes
      : DEFAULT_TRANSCRIPT_RETRY_MINUTES;

  return minutes * 60 * 1000;
}

export async function fetchFreeTranscript(videoId: string): Promise<TranscriptResult> {
  try {
    const mod = (await import("youtube-transcript")) as {
      YoutubeTranscript?: {
        fetchTranscript: (videoId: string) => Promise<Array<{ text: string; offset: number; duration: number }>>;
      };
    };
    const transcript = await mod.YoutubeTranscript?.fetchTranscript(videoId);
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
  } catch {
    const retryAfter = new Date(Date.now() + transcriptRetryDelayMs());
    return {
      status: "missing",
      source: "youtube_transcript_free",
      transcript_text: null,
      timed_segments: null,
      derived_notes: null,
      needs_retry: true,
      retry_after: retryAfter.toISOString(),
    };
  }
}
