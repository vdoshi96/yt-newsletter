import { isBaselineMainVideo } from "../baseline/month";
import type { DiscoveredVideo } from "../youtube/client";

/**
 * Filters a discovery batch down to long-form main uploads, matching the
 * baseline product intent: ingest only videos that pass `isBaselineMainVideo`
 * (duration >= 300s and no Shorts marker in the title).
 *
 * Applied at the hourly cron discovery boundary so Shorts never enter the
 * queue. See docs/wiki/queue-overflow-investigation-2026-05-13.md.
 */
export function filterDiscoveredMainVideos(videos: DiscoveredVideo[]) {
  return videos.filter((video) => isBaselineMainVideo(video));
}
