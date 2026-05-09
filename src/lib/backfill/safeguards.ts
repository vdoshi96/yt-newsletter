import { minimumTranscriptCharacters } from "../digests/grounding";
import type { ProcessingStatus } from "../ingest/status";

export type BackfillCatalogVideo = {
  youtube_video_id: string;
  title?: string | null;
  duration_seconds?: number | null;
};

export function filterBackfillCatalogVideos<T extends BackfillCatalogVideo>(videos: T[]) {
  return videos.filter(isBackfillCatalogVideo);
}

export function isBackfillCatalogVideo(video: BackfillCatalogVideo) {
  const minDurationSeconds = Number(process.env.BACKFILL_MIN_VIDEO_DURATION_SECONDS ?? 300);
  const duration = video.duration_seconds ?? 0;
  if (duration < minDurationSeconds) return false;

  const title = video.title?.toLowerCase() ?? "";
  if (title.includes("#shorts") || title.includes(" #short ")) return false;
  if (title.includes("shorts-style clip")) return false;

  return true;
}

export type DailyBackfillGrounding = {
  transcriptSource?: string | null;
  transcriptLength?: number | null;
  generationModel?: string | null;
};

export type DailyBackfillTranscriptState = {
  sourceAvailable: boolean;
  transcriptLength: number;
};

export type DailyBackfillDecision =
  | {
      action: "skip";
      status: Extract<ProcessingStatus, "digest_generated">;
      reason: string;
    }
  | {
      action: "regenerate";
      status: Extract<ProcessingStatus, "transcript_ready">;
      reason: string;
    }
  | {
      action: "mark_incomplete";
      status: Extract<ProcessingStatus, "transcript_missing">;
      reason: string;
    };

export function resolveDailyBackfillDecision(input: {
  forceRegenerate: boolean;
  hasDailyDigest: boolean;
  grounding?: DailyBackfillGrounding | null;
  transcript?: DailyBackfillTranscriptState | null;
  videoTitle?: string | null;
  minTranscriptCharacters?: number;
}): DailyBackfillDecision {
  const minTranscriptCharacters = input.minTranscriptCharacters ?? minimumTranscriptCharacters();
  if (
    input.hasDailyDigest &&
    !input.forceRegenerate &&
    input.grounding?.transcriptSource === "youtube_transcript_free" &&
    (input.grounding.transcriptLength ?? 0) >= minTranscriptCharacters &&
    Boolean(input.grounding.generationModel)
  ) {
    return {
      action: "skip",
      status: "digest_generated",
      reason: "Existing digest has verified transcript grounding metadata.",
    };
  }

  if (
    input.transcript &&
    input.transcript.sourceAvailable &&
    input.transcript.transcriptLength >= minTranscriptCharacters
  ) {
    return {
      action: "regenerate",
      status: "transcript_ready",
      reason: "Verified transcript text is available for regeneration.",
    };
  }

  if (input.hasDailyDigest && input.forceRegenerate) {
    return {
      action: "regenerate",
      status: "transcript_ready",
      reason: "Force regeneration was requested; transcript validation will run before generation.",
    };
  }

  return {
    action: "mark_incomplete",
    status: "transcript_missing",
    reason:
      "No verified transcript meeting the minimum length is available; title-only generation is forbidden.",
  };
}

export type BackfillVideoCandidate = {
  videoId: string;
  hasOpenIngestItem: boolean;
  hasGroundedDigest: boolean;
};

export function selectVideosForGroundedBackfill(
  candidates: BackfillVideoCandidate[],
  options: { forceRegenerate: boolean },
) {
  const selected = new Set<string>();

  for (const candidate of candidates) {
    if (candidate.hasOpenIngestItem) continue;
    if (candidate.hasGroundedDigest && !options.forceRegenerate) continue;
    selected.add(candidate.videoId);
  }

  return [...selected];
}
