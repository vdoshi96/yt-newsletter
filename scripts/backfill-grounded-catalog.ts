import "./load-env";
import { closeSql, getSql } from "@/lib/db";
import { normalizeConcurrency, runBoundedConcurrency } from "@/lib/concurrency";
import { minimumTranscriptCharacters } from "@/lib/digests/grounding";
import {
  filterBackfillVideosByDate,
  filterBackfillCatalogVideos,
  selectVideosForGroundedBackfill,
  shouldRefreshWeeklyAfterBackfill,
  type BackfillDateWindow,
} from "@/lib/backfill/safeguards";
import { createIngestJob, upsertVideos } from "@/lib/creators";
import { numberEnv } from "@/lib/config";
import { processIngestQueue } from "@/lib/processor";
import { discoverCreatorVideos } from "@/lib/youtube/client";
import {
  ensureCompletedWeeklyDigestsForCreator,
  ensureWeeklyDigestForRange,
} from "@/lib/weekly/generate";
import {
  getSaturdayToFridayWeekRange,
  isWeeklyDigestReady,
  type WeeklyRange,
} from "@/lib/weekly/week-range";

type BackfillCreator = {
  creator_id: string;
  user_id: string;
  channel_url: string;
  title: string | null;
};

type CandidateRow = {
  video_id: string;
  has_open_ingest_item: boolean;
  has_grounded_digest: boolean;
  has_terminal_failure: boolean;
};

const args = new Map(
  process.argv
    .slice(2)
    .map((arg) => {
      const [key, ...rest] = arg.split("=");
      return [key, rest.join("=") || "true"];
    })
    .filter(([key]) => key.startsWith("--"))
    .map(([key, value]) => [key.replace(/^--/, ""), value]),
);

async function main() {
  const dryRun = args.has("dry-run");
  const forceRegenerate = args.has("force");
  const queueOnly = args.has("queue-only");
  const discoveryLimit = numericArg("limit", numberEnv("BACKFILL_VIDEO_LOOKBACK_LIMIT", 500));
  const processLimit = numericArg("process-limit", numberEnv("BACKFILL_PROCESS_LIMIT", 25));
  const creatorId = args.get("creator-id");
  const dateWindow = parseDateWindow();
  const weeklyRanges = dateWindow ? getWeeklyRangesForDateWindow(dateWindow) : null;
  const minTranscriptCharacters = minimumTranscriptCharacters();
  const creators = await getCreators(creatorId);

  if (!creators.length) {
    console.log("No configured creators with channel URLs were found.");
    return;
  }

  if (dateWindow) {
    console.log(
      `Backfill date window: ${toDateString(dateWindow.since)} to ${toDateString(dateWindow.until)} (${weeklyRanges?.length ?? 0} weekly window(s)).`,
    );
  }

  let discovered = 0;
  let queued = 0;
  const touchedCreators = new Set<string>();

  for (const creator of creators) {
    console.log(
      `Backfill scan: ${creator.title ?? creator.creator_id} (${creator.creator_id}), limit ${discoveryLimit}.`,
    );
    const discovery = await discoverCreatorVideos(creator.channel_url, discoveryLimit);
    discovered += discovery.videos.length;
    const longFormVideos = filterBackfillCatalogVideos(discovery.videos);
    const catalogVideos = filterBackfillVideosByDate(longFormVideos, dateWindow);
    const skippedByDate = longFormVideos.length - catalogVideos.length;
    const candidateRows = dryRun
      ? await getDryRunCandidateRows(
          creator.creator_id,
          catalogVideos.map((video) => video.youtube_video_id),
          minTranscriptCharacters,
        )
      : await getCandidateRows(
          await upsertVideos(creator.creator_id, catalogVideos),
          minTranscriptCharacters,
        );
    const selected = selectVideosForGroundedBackfill(
      candidateRows.map((row) => ({
        videoId: row.video_id,
        hasOpenIngestItem: row.has_open_ingest_item,
        hasGroundedDigest: row.has_grounded_digest,
        hasTerminalFailure: row.has_terminal_failure,
      })),
      { forceRegenerate },
    );

    console.log(
      `Backfill candidates: ${selected.length} selected, ${candidateRows.length - selected.length} skipped, ${discovery.videos.length - longFormVideos.length} Shorts/short clips ignored, ${skippedByDate} outside date window.`,
    );
    if (
      shouldRefreshWeeklyAfterBackfill({
        selectedVideoCount: selected.length,
        weeklyRangeCount: weeklyRanges?.length ?? 0,
      })
    ) {
      touchedCreators.add(creator.creator_id);
    }
    if (!selected.length) continue;

    queued += selected.length;
    if (dryRun) continue;

    await createIngestJob({
      userId: creator.user_id,
      creatorId: creator.creator_id,
      requestedCount: selected.length,
      videoIds: selected,
    });
  }

  if (dryRun) {
    console.log(
      `Dry run complete: discovered ${discovered} video(s), would queue ${queued} item(s).`,
    );
    return;
  }

  console.log(`Queued ${queued} grounded backfill item(s) from ${discovered} discovered video(s).`);
  if (!queueOnly) {
    const processed = await drainQueue(processLimit, forceRegenerate);
    console.log(`Processed ${processed} backfill queue item(s).`);
  }

  for (const creatorIdToRefresh of touchedCreators) {
    if (weeklyRanges) {
      const refreshed = await refreshWeeklyRangesForCreator(creatorIdToRefresh, weeklyRanges);
      console.log(
        `Refreshed ${refreshed.length} date-window weekly digest(s) for creator ${creatorIdToRefresh}.`,
      );
    } else {
      const weekly = await ensureCompletedWeeklyDigestsForCreator({
        creatorId: creatorIdToRefresh,
        forceRegenerate: true,
      });
      console.log(
        `Refreshed ${weekly.weekCount} weekly digest(s) for creator ${creatorIdToRefresh}.`,
      );
    }
  }

}

async function getCreators(creatorId?: string) {
  const sql = getSql();
  return sql<BackfillCreator[]>`
    select distinct on (creators.id)
      creators.id as creator_id,
      user_creators.user_id,
      creators.channel_url,
      creators.title
    from creators
    join user_creators on user_creators.creator_id = creators.id
    where creators.channel_url is not null
      and (${creatorId ?? null}::uuid is null or creators.id = ${creatorId ?? null}::uuid)
    order by creators.id, user_creators.created_at asc
  `;
}

async function getCandidateRows(videoIds: string[], minTranscriptCharacters: number) {
  if (!videoIds.length) return [];
  const sql = getSql();
  return sql<CandidateRow[]>`
    select
      videos.id as video_id,
      exists (
        select 1
        from ingest_job_items
        where ingest_job_items.video_id = videos.id
          and ingest_job_items.status in (
            'queued',
            'processing',
            'waiting_for_transcript',
            'generating_digest',
            'generating_assets'
          )
      ) as has_open_ingest_item,
      exists (
        select 1
        from ingest_job_items
        where ingest_job_items.video_id = videos.id
          and ingest_job_items.status = 'failed'
          and ingest_job_items.processing_status = 'failed'
      ) as has_terminal_failure,
      exists (
        select 1
        from daily_digests
        where daily_digests.video_id = videos.id
          and daily_digests.grounding_status = 'grounded'
          and coalesce(
            daily_digests.transcript_source,
            daily_digests.full_digest_json->'transcript_grounding'->>'transcript_source'
          ) = 'youtube_transcript_free'
          and coalesce(
            daily_digests.transcript_length,
            nullif(daily_digests.full_digest_json->'transcript_grounding'->>'transcript_length', '')::int,
            0
          ) >= ${minTranscriptCharacters}
          and coalesce(
            daily_digests.generation_model,
            daily_digests.full_digest_json->'transcript_grounding'->>'generation_model'
          ) is not null
      ) as has_grounded_digest
    from videos
    where videos.id = any(${videoIds}::uuid[])
  `;
}

async function getDryRunCandidateRows(
  creatorId: string,
  youtubeVideoIds: string[],
  minTranscriptCharacters: number,
) {
  if (!youtubeVideoIds.length) return [];
  const sql = getSql();
  return sql<CandidateRow[]>`
    with discovered(youtube_video_id) as (
      select unnest(${youtubeVideoIds}::text[])
    )
    select
      discovered.youtube_video_id as video_id,
      exists (
        select 1
        from videos
        join ingest_job_items on ingest_job_items.video_id = videos.id
        where videos.youtube_video_id = discovered.youtube_video_id
          and videos.creator_id = ${creatorId}
          and ingest_job_items.status in (
            'queued',
            'processing',
            'waiting_for_transcript',
            'generating_digest',
            'generating_assets'
          )
      ) as has_open_ingest_item,
      exists (
        select 1
        from videos
        join ingest_job_items on ingest_job_items.video_id = videos.id
        where videos.youtube_video_id = discovered.youtube_video_id
          and videos.creator_id = ${creatorId}
          and ingest_job_items.status = 'failed'
          and ingest_job_items.processing_status = 'failed'
      ) as has_terminal_failure,
      exists (
        select 1
        from videos
        join daily_digests on daily_digests.video_id = videos.id
        where videos.youtube_video_id = discovered.youtube_video_id
          and videos.creator_id = ${creatorId}
          and daily_digests.grounding_status = 'grounded'
          and coalesce(
            daily_digests.transcript_source,
            daily_digests.full_digest_json->'transcript_grounding'->>'transcript_source'
          ) = 'youtube_transcript_free'
          and coalesce(
            daily_digests.transcript_length,
            nullif(daily_digests.full_digest_json->'transcript_grounding'->>'transcript_length', '')::int,
            0
          ) >= ${minTranscriptCharacters}
          and coalesce(
            daily_digests.generation_model,
            daily_digests.full_digest_json->'transcript_grounding'->>'generation_model'
          ) is not null
      ) as has_grounded_digest
    from discovered
  `;
}

async function drainQueue(processLimit: number, forceRegenerate: boolean) {
  let processed = 0;
  const maxLoops = numericArg("max-loops", numberEnv("BACKFILL_PROCESS_MAX_LOOPS", 200));
  for (let index = 0; index < maxLoops; index += 1) {
    const result = await processIngestQueue(processLimit, {
      forceRegenerateDaily: forceRegenerate,
    });
    processed += result.processed;
    if (result.processed === 0) break;
  }
  return processed;
}

function numericArg(name: string, fallback: number) {
  const value = Number(args.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseDateWindow(): BackfillDateWindow | null {
  const since = args.get("since");
  const until = args.get("until");
  if (!since && !until) return null;

  const sinceDate = parseDateArg("since", since, "start");
  const untilDate = parseDateArg("until", until, "end");
  if (sinceDate > untilDate) {
    throw new Error("--since must be before or equal to --until.");
  }
  return {
    since: sinceDate,
    until: untilDate,
  };
}

function parseDateArg(name: string, value: string | undefined, edge: "start" | "end") {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`--${name}=YYYY-MM-DD is required when using a date-window backfill.`);
  }
  const suffix = edge === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
  const date = new Date(`${value}${suffix}`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`--${name} must be a valid YYYY-MM-DD date.`);
  }
  return date;
}

function getWeeklyRangesForDateWindow(window: BackfillDateWindow) {
  const ranges = new Map<string, WeeklyRange>();
  const cursor = new Date(
    Date.UTC(
      window.since.getUTCFullYear(),
      window.since.getUTCMonth(),
      window.since.getUTCDate(),
    ),
  );
  const end = new Date(
    Date.UTC(
      window.until.getUTCFullYear(),
      window.until.getUTCMonth(),
      window.until.getUTCDate(),
    ),
  );

  while (cursor <= end) {
    const range = getSaturdayToFridayWeekRange(cursor);
    if (isWeeklyDigestReady(range)) {
      ranges.set(range.weekStart, range);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return [...ranges.values()].sort((left, right) => left.weekStart.localeCompare(right.weekStart));
}

async function refreshWeeklyRangesForCreator(creatorId: string, ranges: WeeklyRange[]) {
  const concurrency = Math.min(
    normalizeConcurrency(numberEnv("WEEKLY_DIGEST_CONCURRENCY", 2)),
    Math.max(1, ranges.length),
  );
  const refreshed = await runBoundedConcurrency(ranges, concurrency, async (range) => {
    const id = await ensureWeeklyDigestForRange({
      creatorId,
      range,
      forceRegenerate: true,
    });
    return id;
  });
  return refreshed.filter((id): id is string => Boolean(id));
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

main()
  .catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSql();
  });
