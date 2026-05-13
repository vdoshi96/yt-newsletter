import { describe, expect, it } from "vitest";
import { filterDiscoveredMainVideos } from "../src/lib/ingest/discovery-filter";
import type { DiscoveredVideo } from "../src/lib/youtube/client";

function makeVideo(overrides: Partial<DiscoveredVideo>): DiscoveredVideo {
  return {
    youtube_video_id: overrides.youtube_video_id ?? "vid",
    title: overrides.title ?? "Untitled",
    description: overrides.description ?? null,
    url: overrides.url ?? "https://www.youtube.com/watch?v=vid",
    thumbnail_url: overrides.thumbnail_url ?? null,
    published_at: overrides.published_at ?? "2026-05-12T12:00:00Z",
    duration_seconds: overrides.duration_seconds ?? null,
  };
}

describe("hourly discovery Shorts filter", () => {
  it("excludes Shorts-style uploads and keeps long-form main videos", () => {
    const shortByDuration = makeVideo({
      youtube_video_id: "short-by-duration",
      title: "Quick clip #Shorts",
      duration_seconds: 45,
    });
    const longMain = makeVideo({
      youtube_video_id: "long-main",
      title: "Deep dive into agent loops",
      duration_seconds: 900,
    });

    const filtered = filterDiscoveredMainVideos([shortByDuration, longMain]);

    expect(filtered.map((video) => video.youtube_video_id)).toEqual(["long-main"]);
  });

  it("excludes long-duration uploads when the title still marks them as Shorts", () => {
    const longButTaggedShort = makeVideo({
      youtube_video_id: "tagged-short",
      title: "Long form #shorts",
      duration_seconds: 1200,
    });

    expect(filterDiscoveredMainVideos([longButTaggedShort])).toEqual([]);
  });

  it("treats videos with null duration as Shorts (cannot confirm length)", () => {
    const nullDuration = makeVideo({
      youtube_video_id: "rss-fallback",
      title: "Untitled video",
      duration_seconds: null,
    });

    expect(filterDiscoveredMainVideos([nullDuration])).toEqual([]);
  });
});
