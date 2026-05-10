import { describe, expect, it } from "vitest";
import {
  filterBackfillCatalogVideos,
  filterBackfillVideosByDate,
  resolveDailyBackfillDecision,
  selectVideosForGroundedBackfill,
  shouldRefreshWeeklyAfterBackfill,
} from "../src/lib/backfill/safeguards";

describe("grounded backfill safeguards", () => {
  it("skips already grounded daily digests unless force regeneration is requested", () => {
    const grounded = {
      transcriptSource: "youtube_transcript_free",
      transcriptLength: 1600,
      generationModel: "deepseek:deepseek-chat",
    };

    expect(
      resolveDailyBackfillDecision({
        forceRegenerate: false,
        hasDailyDigest: true,
        grounding: grounded,
      }),
    ).toMatchObject({
      action: "skip",
      status: "digest_generated",
    });

    expect(
      resolveDailyBackfillDecision({
        forceRegenerate: true,
        hasDailyDigest: true,
        grounding: grounded,
      }),
    ).toMatchObject({
      action: "regenerate",
      status: "transcript_ready",
    });
  });

  it("marks missing or short transcripts incomplete instead of allowing title-only generation", () => {
    expect(
      resolveDailyBackfillDecision({
        forceRegenerate: false,
        hasDailyDigest: false,
        videoTitle: "A title that sounds very summarizable",
        transcript: {
          sourceAvailable: false,
          transcriptLength: 0,
        },
      }),
    ).toMatchObject({
      action: "mark_incomplete",
      status: "transcript_missing",
    });

    expect(
      resolveDailyBackfillDecision({
        forceRegenerate: false,
        hasDailyDigest: false,
        videoTitle: "Another tempting title",
        transcript: {
          sourceAvailable: true,
          transcriptLength: 400,
        },
      }),
    ).toMatchObject({
      action: "mark_incomplete",
      status: "transcript_missing",
    });
  });

  it("does not duplicate backfill work for grounded videos on rerun", () => {
    const selected = selectVideosForGroundedBackfill(
      [
        {
          videoId: "grounded-existing",
          hasOpenIngestItem: false,
          hasGroundedDigest: true,
        },
        {
          videoId: "already-queued",
          hasOpenIngestItem: true,
          hasGroundedDigest: false,
        },
        {
          videoId: "terminal-failure",
          hasOpenIngestItem: false,
          hasGroundedDigest: false,
          hasTerminalFailure: true,
        },
        {
          videoId: "needs-regeneration",
          hasOpenIngestItem: false,
          hasGroundedDigest: false,
        },
      ],
      { forceRegenerate: false },
    );

    expect(selected).toEqual(["needs-regeneration"]);
  });

  it("allows explicit force reruns for terminal failures", () => {
    const selected = selectVideosForGroundedBackfill(
      [
        {
          videoId: "terminal-failure",
          hasOpenIngestItem: false,
          hasGroundedDigest: false,
          hasTerminalFailure: true,
        },
      ],
      { forceRegenerate: true },
    );

    expect(selected).toEqual(["terminal-failure"]);
  });

  it("filters shorts and very short clips out of the back catalog before queueing", () => {
    const videos = filterBackfillCatalogVideos([
      {
        youtube_video_id: "long-video",
        title: "A real weekly strategy episode",
        duration_seconds: 1841,
      },
      {
        youtube_video_id: "short-tag",
        title: "Fast tip #shorts",
        duration_seconds: 61,
      },
      {
        youtube_video_id: "short-duration",
        title: "Tiny clip",
        duration_seconds: 42,
      },
    ]);

    expect(videos.map((video) => video.youtube_video_id)).toEqual(["long-video"]);
  });

  it("limits operational backfills to the requested published-at date window", () => {
    const videos = filterBackfillVideosByDate(
      [
        {
          youtube_video_id: "too-old",
          published_at: "2026-04-10T23:59:59.000Z",
        },
        {
          youtube_video_id: "in-window-start",
          published_at: "2026-04-11T00:00:00.000Z",
        },
        {
          youtube_video_id: "in-window-end",
          published_at: "2026-05-08T23:59:59.000Z",
        },
        {
          youtube_video_id: "too-new",
          published_at: "2026-05-09T00:00:00.000Z",
        },
      ],
      {
        since: new Date("2026-04-11T00:00:00.000Z"),
        until: new Date("2026-05-08T23:59:59.999Z"),
      },
    );

    expect(videos.map((video) => video.youtube_video_id)).toEqual([
      "in-window-start",
      "in-window-end",
    ]);
  });

  it("refreshes date-window weekly digests even when no daily videos need requeueing", () => {
    expect(
      shouldRefreshWeeklyAfterBackfill({
        selectedVideoCount: 0,
        weeklyRangeCount: 4,
      }),
    ).toBe(true);

    expect(
      shouldRefreshWeeklyAfterBackfill({
        selectedVideoCount: 0,
        weeklyRangeCount: 0,
      }),
    ).toBe(false);
  });
});
