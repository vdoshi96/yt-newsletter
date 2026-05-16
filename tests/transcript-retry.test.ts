import { afterEach, describe, expect, it, vi } from "vitest";
import { transcriptRetryDelayMs } from "../src/lib/youtube/transcripts";

describe("transcript retry delay", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to an hourly retry even when the legacy hours variable is still set", () => {
    vi.stubEnv("TRANSCRIPT_RETRY_MINUTES", "");
    vi.stubEnv("TRANSCRIPT_RETRY_HOURS", "24");

    expect(transcriptRetryDelayMs()).toBe(60 * 60 * 1000);
  });

  it("allows an explicit minute-level retry override", () => {
    vi.stubEnv("TRANSCRIPT_RETRY_MINUTES", "15");

    expect(transcriptRetryDelayMs()).toBe(15 * 60 * 1000);
  });
});
