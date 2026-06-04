import { afterEach, describe, expect, it, vi } from "vitest";
import { YoutubeTranscript } from "youtube-transcript";
import {
  classifyTranscriptFetchError,
  fetchFreeTranscript,
  fetchTranscriptWithTimeout,
  transcriptFetchTimeoutMs,
} from "../src/lib/youtube/transcripts";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: {
    fetchTranscript: vi.fn(),
  },
}));

describe("transcript fetch timeout handling", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("uses a conservative configurable timeout", () => {
    vi.stubEnv("TRANSCRIPT_FETCH_TIMEOUT_MS", "1234");

    expect(transcriptFetchTimeoutMs()).toBe(1234);
  });

  it("rejects hanging transcript fetches before the route timeout", async () => {
    vi.useFakeTimers();
    const pendingFetch = () => new Promise<Array<{ text: string; offset: number; duration: number }>>(() => {});
    const result = fetchTranscriptWithTimeout("video-1", pendingFetch, 25);
    const assertion = expect(result).rejects.toMatchObject({
      reason: "timeout",
      retryable: true,
    });

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });

  it("classifies transcript fetch failures for logs", () => {
    const classified = classifyTranscriptFetchError(
      Object.assign(new Error("Transcript fetch timed out after 25ms."), {
        reason: "timeout",
        retryable: true,
      }),
    );

    expect(classified).toEqual({
      reason: "timeout",
      retryable: true,
      message: "Transcript fetch timed out after 25ms.",
    });
  });

  it("does not call the managed transcript API for a fresh scraper miss", async () => {
    vi.mocked(YoutubeTranscript.fetchTranscript).mockRejectedValue(
      new Error("Transcript is disabled on this video."),
    );
    const managedFetch = vi.fn();
    vi.stubGlobal("fetch", managedFetch);

    const result = await fetchFreeTranscript("video-1");

    expect(result).toMatchObject({
      status: "missing",
      source: "youtube_transcript_free",
    });
    expect(managedFetch).not.toHaveBeenCalled();
  });

  it("uses TranscriptAPI when the caller allows the managed fallback", async () => {
    vi.stubEnv("TRANSCRIPT_API_KEY", "test-transcript-api-key");
    vi.mocked(YoutubeTranscript.fetchTranscript).mockRejectedValue(
      new Error("Transcript is disabled on this video."),
    );
    const managedFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          transcript: [
            { text: "Agents need observability.", start: 0, duration: 2 },
            { text: "Retries should be bounded.", start: 2, duration: 3 },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", managedFetch);

    const result = await fetchFreeTranscript("video-1", {
      allowManagedFallback: true,
    });

    expect(result).toMatchObject({
      status: "completed",
      source: "transcriptapi_com",
      transcript_text: "Agents need observability.\nRetries should be bounded.",
    });
    expect(result.status === "completed" ? result.timed_segments : []).toEqual([
      { text: "Agents need observability.", offset: 0, duration: 2000 },
      { text: "Retries should be bounded.", offset: 2000, duration: 3000 },
    ]);
    expect(managedFetch).toHaveBeenCalledWith(
      expect.stringContaining("https://transcriptapi.com/api/v2/youtube/transcript"),
      expect.objectContaining({
        headers: { Authorization: "Bearer test-transcript-api-key" },
      }),
    );
  });
});
