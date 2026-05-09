import { describe, expect, it } from "vitest";
import { estimateIngestSeconds, summarizeJobProgress } from "../src/lib/jobs/progress";

describe("ingest progress", () => {
  it("uses the requested estimate formula", () => {
    expect(estimateIngestSeconds(5)).toBe(45 + 5 * 90);
  });

  it("summarizes processed and failed videos without going negative", () => {
    expect(
      summarizeJobProgress({
        totalCount: 3,
        processedCount: 1,
        failedCount: 1,
        estimatedSeconds: 315,
      }),
    ).toEqual({
      completedCount: 2,
      remainingCount: 1,
      percentComplete: 67,
      estimatedSecondsRemaining: 105,
    });
  });
});
