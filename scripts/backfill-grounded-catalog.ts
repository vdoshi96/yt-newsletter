import "./load-env";
import { closeSql, getSql } from "@/lib/db";
import { minimumTranscriptCharacters } from "@/lib/digests/grounding";
import {
  filterBackfillCatalogVideos,
  selectVideosForGroundedBackfill,
} from "@/lib/backfill/safeguards";
import { createIngestJob, upsertVideos } from "@/lib/creators";
import { numberEnv } from "@/lib/config";
import { processIngestQueue } from "@/lib/processor";
import { discoverCreatorVideos } from "@/lib/youtube/client";
import { ensureCompletedWeeklyDigestsForCreator } from "@/lib/weekly/generate";

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
  const minTranscriptCharacters = minimumTranscriptCharacters();
  const creators = await getCreators(creatorId);

  if (!creators.length) {
    console.log("No configured creators with channel URLs were found.");
    return;
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
    const catalogVideos = filterBackfillCatalogVideos(discovery.videos);
    const skippedShorts = discovery.videos.length - catalogVideos.length;
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
      })),
      { forceRegenerate },
    );

    console.log(
      `Backfill candidates: ${selected.length} selected, ${candidateRows.length - selected.length} skipped, ${skippedShorts} Shorts/short clips ignored.`,
    );
    if (!selected.length) continue;

    touchedCreators.add(creator.creator_id);
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
    const weekly = await ensureCompletedWeeklyDigestsForCreator({
      creatorId: creatorIdToRefresh,
      forceRegenerate: true,
    });
    console.log(
      `Refreshed ${weekly.weekCount} weekly digest(s) for creator ${creatorIdToRefresh}.`,
    );
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
        from daily_digests
        where daily_digests.video_id = videos.id
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
        join daily_digests on daily_digests.video_id = videos.id
        where videos.youtube_video_id = discovered.youtube_video_id
          and videos.creator_id = ${creatorId}
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

main()
  .catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSql();
  });
