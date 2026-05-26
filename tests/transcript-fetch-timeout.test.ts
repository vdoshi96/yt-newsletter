import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyTranscriptFetchError,
  fetchTranscriptWithTimeout,
  transcriptFetchTimeoutMs,
} from "../src/lib/youtube/transcripts";

describe("transcript fetch timeout handling", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
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
});
