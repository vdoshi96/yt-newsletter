import { describe, expect, it } from "vitest";
import { selectVideoIdsNeedingIngestion } from "../src/lib/ingest/discovery";

describe("ingest discovery recovery", () => {
  it("queues already-known videos when no digest or open ingest item exists", () => {
    const selected = selectVideoIdsNeedingIngestion([
      {
        videoId: "already-digested",
        hasDailyDigest: true,
        hasOpenIngestItem: false,
      },
      {
        videoId: "already-queued",
        hasDailyDigest: false,
        hasOpenIngestItem: true,
      },
      {
        videoId: "missed-by-previous-cron",
        hasDailyDigest: false,
        hasOpenIngestItem: false,
      },
      {
        videoId: "failed-earlier-and-can-recover",
        hasDailyDigest: false,
        hasOpenIngestItem: false,
      },
    ]);

    expect(selected).toEqual(["missed-by-previous-cron", "failed-earlier-and-can-recover"]);
  });
});
