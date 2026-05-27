import crypto from "node:crypto";
import { generateDailyDigestPayload } from "@/lib/ai";
import { isBaselineMainVideo } from "@/lib/baseline/month";
import { normalizeConcurrency, runBoundedConcurrency } from "@/lib/concurrency";
import { booleanEnv, numberEnv } from "@/lib/config";
import { getSql } from "@/lib/db";
import { digestDateFromPublishedAt } from "@/lib/digests/date";
import {
  buildDailyFollowUp,
  type DailyFollowUpDigest,
} from "@/lib/digests/follow-up";
import type { DailyDigestTranscriptRecord } from "@/lib/digests/grounding";
import { isGroundedDailyDigestRow } from "@/lib/digests/rendering";
import { filterDiscoveredMainVideos } from "@/lib/ingest/discovery-filter";
import { selectVideoIdsNeedingIngestion } from "@/lib/ingest/discovery";
import { loadPrompt } from "@/lib/prompts";
import { fetchFreeTranscript, transcriptRetryDelayMs } from "@/lib/youtube/transcripts";

export type QueueItem = {
  item_id: string;
  job_id: string;
  creator_id: string;
  video_id: string;
  youtube_video_id: string;
  title: string;
  url: string;
  published_at: string | Date | null;
  duration_seconds: number | null;
  retry_count: number;
};

type QueueScanStatus = "queued" | "failed" | "waiting_for_transcript" | "processing";

const RETRY_MAX_ATTEMPTS = numberEnv("INGEST_ITEM_MAX_RETRIES", 5);
const RETRY_DELAY_SECONDS = numberEnv("INGEST_ITEM_RETRY_DELAY_SECONDS", 3600);
const TRANSCRIPT_MAX_ATTEMPTS = numberEnv("TRANSCRIPT_MAX_RETRY_ATTEMPTS", 48);
const TRANSCRIPT_EXTENDED_RETRY_SECONDS = numberEnv("TRANSCRIPT_EXTENDED_RETRY_SECONDS", 86400);
const TRANSCRIPT_RETRY_DELAY_SECONDS = Math.ceil(transcriptRetryDelayMs() / 1000);

export type ProcessIngestQueueOptions = {
  forceRegenerateDaily?: boolean;
};

export async function processIngestQueue(
  limit = numberEnv("MAX_VIDEOS_PROCESSED_PER_CRON_RUN", 1),
  options: ProcessIngestQueueOptions = {},
) {
  const sql = getSql();
  const concurrency = getIngestProcessConcurrency(limit);
  logIngest("queue-scan-started", { limit, concurrency });
  const terminalizedStaleProcessing = await markExhaustedStaleProcessingRows();
  const candidateCounts = await getQueueScanCandidateCounts();
  logIngest("queue-scan-candidates", {
    ...candidateCounts,
    terminalizedStaleProcessing,
  });
  const items = await sql.begin(async (transaction) => transaction<QueueItem[]>`
    with candidates as (
      select
        ingest_job_items.id as item_id,
        ingest_job_items.job_id,
        ingest_jobs.creator_id,
        videos.id as video_id,
        videos.youtube_video_id,
        videos.title,
        videos.url,
        videos.published_at,
        videos.duration_seconds,
        ingest_job_items.retry_count,
        ingest_job_items.status as item_status
      from ingest_job_items
      join ingest_jobs on ingest_jobs.id = ingest_job_items.job_id
      join videos on videos.id = ingest_job_items.video_id
      where ingest_job_items.status = 'queued'
         or (
          ingest_job_items.status = 'waiting_for_transcript'
          and ingest_job_items.completed_at is null
          and (
            exists (
              select 1
              from transcripts
              where transcripts.video_id = videos.id
                and transcripts.source = 'youtube_transcript_free'
                and transcripts.status = 'completed'
                and transcripts.transcript_text is not null
            )
            or ingest_job_items.next_retry_at <= now()
            or (
              ingest_job_items.next_retry_at is null
              and exists (
                select 1
                from transcripts
                where transcripts.video_id = videos.id
                  and transcripts.source = 'youtube_transcript_free'
                  and transcripts.needs_retry = true
                  and (
                    transcripts.retry_after is null
                    or transcripts.retry_after <= now()
                    or transcripts.updated_at <= now() - make_interval(secs => ${TRANSCRIPT_RETRY_DELAY_SECONDS}::int)
                  )
              )
            )
          )
        )
         or (
          ingest_job_items.status = 'failed'
          and ingest_job_items.completed_at is null
          and ingest_job_items.retry_count < ${RETRY_MAX_ATTEMPTS}
          and (ingest_job_items.next_retry_at is null or ingest_job_items.next_retry_at <= now())
        )
         or (
          ingest_job_items.status = 'processing'
          and ingest_job_items.started_at < now() - make_interval(secs => ${RETRY_DELAY_SECONDS}::int)
          and ingest_job_items.retry_count < ${RETRY_MAX_ATTEMPTS}
        )
      order by
        case
          when ingest_job_items.status = 'waiting_for_transcript'
            and exists (
              select 1
              from transcripts
              where transcripts.video_id = videos.id
                and transcripts.source = 'youtube_transcript_free'
                and transcripts.status = 'completed'
                and transcripts.transcript_text is not null
            )
            then 0
          when ingest_job_items.status = 'waiting_for_transcript'
            and (
              ingest_job_items.next_retry_at <= now()
              or (
                ingest_job_items.next_retry_at is null
                and exists (
                  select 1
                  from transcripts
                  where transcripts.video_id = videos.id
                    and transcripts.source = 'youtube_transcript_free'
                    and transcripts.needs_retry = true
                    and (
                      transcripts.retry_after is null
                      or transcripts.retry_after <= now()
                      or transcripts.updated_at <= now() - make_interval(secs => ${TRANSCRIPT_RETRY_DELAY_SECONDS}::int)
                    )
                )
              )
            )
            then 0
          when ingest_job_items.status = 'queued' then 2
          when ingest_job_items.status = 'failed' then 3
          else 4
        end,
        case
          when ingest_job_items.status in ('waiting_for_transcript', 'queued')
            then videos.published_at
        end desc nulls last,
        coalesce(ingest_job_items.next_retry_at, ingest_job_items.created_at) asc,
        videos.published_at desc nulls last,
        ingest_job_items.created_at asc
      limit ${limit}
      for update of ingest_job_items skip locked
    ),
    claimed as (
      update ingest_job_items
      set
        status = 'processing',
        processing_status = 'pending',
        validation_log = coalesce(ingest_job_items.validation_log, '{}'::jsonb) || jsonb_build_object(
          'event',
          case
            when candidates.item_status = 'processing' then 'stale_processing_reclaimed'
            else 'queue_item_claimed'
          end,
          'previousStatus',
          candidates.item_status,
          'retryCount',
          case
            when candidates.item_status = 'processing' then ingest_job_items.retry_count + 1
            else ingest_job_items.retry_count
          end,
          'timestamp',
          now()
        ),
        retry_count = case
          when candidates.item_status = 'processing' then ingest_job_items.retry_count + 1
          else ingest_job_items.retry_count
        end,
        started_at = now(),
        updated_at = now()
      from candidates
      where ingest_job_items.id = candidates.item_id
      returning
        candidates.item_id,
        candidates.job_id,
        candidates.creator_id,
        candidates.video_id,
        candidates.youtube_video_id,
        candidates.title,
        candidates.url,
        candidates.published_at,
        candidates.duration_seconds,
        ingest_job_items.retry_count
    )
    select * from claimed
  `);

  logIngest("queue-scan-finished", { discoveredItems: items.length, limit, concurrency });
  await runBoundedConcurrency(items, concurrency, async (item) => {
    await processQueueItem(item, options);
    return item.item_id;
  });
  const processed = items.length;

  return { processed, limit, concurrency };
}

export async function refreshCreatorsAndProcessQueue(
  limit = numberEnv("MAX_VIDEOS_PROCESSED_PER_CRON_RUN", 1),
) {
  const discovery = await checkCreatorsForNewVideos();
  const processing = await processIngestQueue(limit);

  return {
    ...discovery,
    processed: processing.processed,
    limit: processing.limit,
  };
}

function getIngestProcessConcurrency(limit: number) {
  return Math.min(
    normalizeConcurrency(numberEnv("INGEST_PROCESS_CONCURRENCY", 2)),
    Math.max(1, limit),
  );
}

async function getQueueScanCandidateCounts() {
  const sql = getSql();
  const rows = await sql<Array<{ status: QueueScanStatus; count: number }>>`
    select ingest_job_items.status as status, count(*)::int as count
    from ingest_job_items
    join ingest_jobs on ingest_jobs.id = ingest_job_items.job_id
    join videos on videos.id = ingest_job_items.video_id
    where ingest_job_items.status = 'queued'
       or (
        ingest_job_items.status = 'waiting_for_transcript'
        and ingest_job_items.completed_at is null
        and (
          exists (
            select 1
            from transcripts
            where transcripts.video_id = videos.id
              and transcripts.source = 'youtube_transcript_free'
              and transcripts.status = 'completed'
              and transcripts.transcript_text is not null
          )
          or ingest_job_items.next_retry_at <= now()
          or (
            ingest_job_items.next_retry_at is null
            and exists (
              select 1
              from transcripts
              where transcripts.video_id = videos.id
                and transcripts.source = 'youtube_transcript_free'
                and transcripts.needs_retry = true
                and (
                  transcripts.retry_after is null
                  or transcripts.retry_after <= now()
                  or transcripts.updated_at <= now() - make_interval(secs => ${TRANSCRIPT_RETRY_DELAY_SECONDS}::int)
                )
            )
          )
        )
      )
       or (
        ingest_job_items.status = 'failed'
        and ingest_job_items.completed_at is null
        and ingest_job_items.retry_count < ${RETRY_MAX_ATTEMPTS}
        and (ingest_job_items.next_retry_at is null or ingest_job_items.next_retry_at <= now())
      )
       or (
        ingest_job_items.status = 'processing'
        and ingest_job_items.started_at < now() - make_interval(secs => ${RETRY_DELAY_SECONDS}::int)
        and ingest_job_items.retry_count < ${RETRY_MAX_ATTEMPTS}
      )
    group by ingest_job_items.status
  `;
  const counts: Record<QueueScanStatus, number> = {
    queued: 0,
    failed: 0,
    waiting_for_transcript: 0,
    processing: 0,
  };
  for (const row of rows) {
    counts[row.status] = row.count;
  }
  return {
    ...counts,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
  };
}

async function markExhaustedStaleProcessingRows() {
  const sql = getSql();
  const rows = await sql<Array<{ job_id: string; item_count: number }>>`
    with terminalized as (
      update ingest_job_items
      set
        status = 'failed',
        processing_status = 'failed',
        error_message = 'Stale processing item exceeded retry budget before recovery.',
        next_retry_at = null,
        completed_at = now(),
        validation_log = coalesce(validation_log, '{}'::jsonb) || jsonb_build_object(
          'event', 'stale_processing_retry_exhausted',
          'retryCount', retry_count,
          'maxAttempts', ${RETRY_MAX_ATTEMPTS}::int,
          'timestamp', now()
        ),
        updated_at = now()
      where status = 'processing'
        and started_at < now() - make_interval(secs => ${RETRY_DELAY_SECONDS}::int)
        and retry_count >= ${RETRY_MAX_ATTEMPTS}
      returning job_id
    )
    select job_id, count(*)::int as item_count
    from terminalized
    group by job_id
  `;
  for (const row of rows) {
    await syncJobCounts(row.job_id);
  }
  const itemCount = rows.reduce((sum, row) => sum + row.item_count, 0);
  if (itemCount > 0) {
    logIngest("stale-processing-terminalized", {
      itemCount,
      jobCount: rows.length,
      maxAttempts: RETRY_MAX_ATTEMPTS,
    });
  }
  return itemCount;
}

async function processQueueItem(item: QueueItem, options: ProcessIngestQueueOptions = {}) {
  const sql = getSql();
  logIngest("item-started", {
    itemId: item.item_id,
    jobId: item.job_id,
    videoId: item.video_id,
    youtubeVideoId: item.youtube_video_id,
  });
  await sql`
    update ingest_jobs
    set status = 'processing', current_video_id = ${item.video_id}, started_at = coalesce(started_at, now()), updated_at = now()
    where id = ${item.job_id}
  `;
  await sql`
    update ingest_job_items
    set
      status = 'processing',
      processing_status = 'pending',
      validation_log = ${sql.json({
        event: "processing_started",
        youtubeVideoId: item.youtube_video_id,
        timestamp: new Date().toISOString(),
      })},
      started_at = now(),
      next_retry_at = null,
      updated_at = now()
    where id = ${item.item_id}
  `;

  try {
    if (!isBaselineMainVideo(item)) {
      const message = "Video does not meet main-video ingestion criteria.";
      logIngest("item-skipped-non-main-video", {
        itemId: item.item_id,
        videoId: item.video_id,
        youtubeVideoId: item.youtube_video_id,
        durationSeconds: item.duration_seconds,
      });
      await markQueueItemTerminalFailure(item, message);
      return;
    }

    const transcript = await ensureTranscript(item);
    if (transcript.status === "missing") {
      const nextRetryCount = item.retry_count + 1;
      const retryAfter =
        "retry_after" in transcript
          ? transcript.retry_after
          : new Date(Date.now() + transcriptRetryDelayMs()).toISOString();
      const usesExtendedRetry = nextRetryCount >= TRANSCRIPT_MAX_ATTEMPTS;
      const nextRetryAt = usesExtendedRetry
        ? new Date(Date.now() + TRANSCRIPT_EXTENDED_RETRY_SECONDS * 1000).toISOString()
        : retryAfter;
      logIngest("transcript-waiting", {
        itemId: item.item_id,
        videoId: item.video_id,
        retryCount: nextRetryCount,
        hourlyAttemptBudget: TRANSCRIPT_MAX_ATTEMPTS,
        nextRetryAt,
        extendedRetry: usesExtendedRetry,
      });

      await sql`
        update ingest_job_items
        set
          status = 'waiting_for_transcript',
          processing_status = 'transcript_missing',
          error_message = ${usesExtendedRetry
            ? "Transcript still missing after hourly retry budget; extended retry scheduled."
            : "Transcript missing; waiting for retry window."},
          retry_count = ${nextRetryCount},
          next_retry_at = ${nextRetryAt},
          completed_at = null,
          validation_log = ${sql.json({
            sourceAvailable: false,
            transcriptLength: 0,
            groundingStatus: "blocked",
            retryCount: nextRetryCount,
            nextRetryAt,
            extendedRetry: usesExtendedRetry,
            timestamp: new Date().toISOString(),
          })},
          updated_at = now()
        where id = ${item.item_id}
      `;
      await sql`
        update ingest_jobs
        set status = 'waiting_for_transcript', updated_at = now()
        where id = ${item.job_id}
      `;
      await syncJobCounts(item.job_id);
      return;
    }

    await sql`
      update ingest_jobs
      set status = 'generating_digest', updated_at = now()
      where id = ${item.job_id}
    `;

    const completedTranscript = transcript as DailyDigestTranscriptRecord;
    const transcriptLength = completedTranscript.transcript_text?.trim().length ?? 0;
    await sql`
      update ingest_job_items
      set
        processing_status = 'transcript_ready',
        retry_count = 0,
        next_retry_at = null,
        validation_log = ${sql.json({
          sourceAvailable: true,
          transcriptLength,
          transcriptSource: completedTranscript.source,
          groundingStatus: "ready",
          timestamp: new Date().toISOString(),
        })},
        updated_at = now()
      where id = ${item.item_id}
    `;
    logIngest("summarization-started", {
      itemId: item.item_id,
      videoId: item.video_id,
      source: completedTranscript.source,
      transcriptLength,
    });
    await ensureDailyDigest(item, completedTranscript, {
      forceRegenerate: options.forceRegenerateDaily,
    });
    await sql`
      update ingest_job_items
      set status = 'completed', processing_status = 'digest_generated', completed_at = now(), updated_at = now()
      where id = ${item.item_id}
    `;
    logIngest("item-completed", {
      itemId: item.item_id,
      videoId: item.video_id,
    });
  } catch (error) {
    const message = (error as Error).message;
    console.error("[ingest:item-failed]", {
      itemId: item.item_id,
      jobId: item.job_id,
      videoId: item.video_id,
      message,
    });
    await sql`
      update daily_digests
      set
        grounding_status = 'failed',
        processing_status = 'failed',
        updated_at = now()
      where video_id = ${item.video_id}
        and grounding_status <> 'grounded'
    `;

    const currentRows = await sql<Array<{ retry_count: number }>>`
      select retry_count from ingest_job_items where id = ${item.item_id}
    `;
    const currentRetryCount = currentRows[0]?.retry_count ?? 0;
    const nextRetryCount = currentRetryCount + 1;

    if (nextRetryCount < RETRY_MAX_ATTEMPTS) {
      await sql`
        update ingest_job_items
        set
          status = 'failed',
          processing_status = 'failed',
          error_message = ${message},
          retry_count = ${nextRetryCount},
          next_retry_at = now() + make_interval(secs => ${RETRY_DELAY_SECONDS}::int),
          completed_at = null,
          updated_at = now()
        where id = ${item.item_id}
      `;
      logIngest("item-retry-scheduled", {
        itemId: item.item_id,
        jobId: item.job_id,
        videoId: item.video_id,
        retryCount: nextRetryCount,
        maxAttempts: RETRY_MAX_ATTEMPTS,
        retryDelaySeconds: RETRY_DELAY_SECONDS,
      });
    } else {
      await sql`
        update ingest_job_items
        set
          status = 'failed',
          processing_status = 'failed',
          error_message = ${message},
          retry_count = ${nextRetryCount},
          next_retry_at = null,
          completed_at = now(),
          updated_at = now()
        where id = ${item.item_id}
      `;
      logIngest("item-retry-exhausted", {
        itemId: item.item_id,
        jobId: item.job_id,
        videoId: item.video_id,
        retryCount: nextRetryCount,
        maxAttempts: RETRY_MAX_ATTEMPTS,
      });
    }
  } finally {
    await syncJobCounts(item.job_id);
  }
}

async function markQueueItemTerminalFailure(
  item: QueueItem,
  message: string,
  retryCount = item.retry_count,
) {
  const sql = getSql();
  await sql`
    update daily_digests
    set
      grounding_status = 'failed',
      processing_status = 'failed',
      updated_at = now()
    where video_id = ${item.video_id}
      and grounding_status <> 'grounded'
  `;
  await sql`
    update ingest_job_items
    set
      status = 'failed',
      processing_status = 'failed',
      error_message = ${message},
      retry_count = ${retryCount},
      next_retry_at = null,
      completed_at = now(),
      updated_at = now()
    where id = ${item.item_id}
  `;
  logIngest("item-terminal-failed", {
    itemId: item.item_id,
    jobId: item.job_id,
    videoId: item.video_id,
    message,
    retryCount,
  });
}

export async function ensureTranscript(item: QueueItem) {
  const sql = getSql();
  const existing = await sql<DailyDigestTranscriptRecord[]>`
    select
      id,
      video_id,
      status,
      source,
      transcript_text,
      timed_segments,
      derived_notes,
      created_at::text,
      updated_at::text
    from transcripts
    where video_id = ${item.video_id}
      and status = 'completed'
      and source = 'youtube_transcript_free'
      and transcript_text is not null
    order by created_at desc
    limit 1
  `;

  if (existing[0]) {
    const transcriptLength = existing[0].transcript_text?.trim().length ?? 0;
    const transcriptId = existing[0].id;
    if (transcriptId) {
      await sql`
        update transcripts
        set
          transcript_length = coalesce(transcript_length, ${transcriptLength}),
          source_hash = coalesce(source_hash, ${hashSourceText(existing[0].transcript_text ?? "")}),
          extraction_metadata = coalesce(
            extraction_metadata,
            ${sql.json({
              api: "youtube-transcript",
              source: existing[0].source,
              youtubeVideoId: item.youtube_video_id,
              segmentCount: existing[0].timed_segments?.length ?? 0,
              transcriptLength,
              reusedExisting: true,
            })}
          ),
          extracted_at = coalesce(extracted_at, created_at, now()),
          processing_status = 'transcript_ready',
          updated_at = now()
        where id = ${transcriptId}
      `;
    }
    logIngest("transcript-existing", {
      videoId: item.video_id,
      source: existing[0].source,
      characters: transcriptLength,
      sourceAvailable: true,
    });
    return existing[0];
  }

  logIngest("transcript-fetch-started", {
    videoId: item.video_id,
    youtubeVideoId: item.youtube_video_id,
  });
  const freeTranscript = await fetchFreeTranscript(item.youtube_video_id);
  if (freeTranscript.status === "completed") {
    const transcriptLength = freeTranscript.transcript_text.length;
    const extractionMetadata = {
      api: "youtube-transcript",
      source: freeTranscript.source,
      youtubeVideoId: item.youtube_video_id,
      segmentCount: freeTranscript.timed_segments.length,
      transcriptLength,
      fetchedAt: new Date().toISOString(),
    };
    const rows = await sql<DailyDigestTranscriptRecord[]>`
      insert into transcripts (
        video_id,
        source,
        status,
        transcript_text,
        timed_segments,
        derived_notes,
        transcript_length,
        source_hash,
        extraction_metadata,
        extracted_at,
        processing_status,
        needs_retry,
        retry_after
      )
      values (
        ${item.video_id},
        ${freeTranscript.source},
        ${freeTranscript.status},
        ${freeTranscript.transcript_text},
        ${sql.json(freeTranscript.timed_segments)},
        null,
        ${transcriptLength},
        ${hashSourceText(freeTranscript.transcript_text)},
        ${sql.json(extractionMetadata)},
        now(),
        'transcript_ready',
        false,
        null
      )
      on conflict (video_id, source) do update set
        status = excluded.status,
        transcript_text = excluded.transcript_text,
        timed_segments = excluded.timed_segments,
        derived_notes = excluded.derived_notes,
        transcript_length = excluded.transcript_length,
        source_hash = excluded.source_hash,
        extraction_metadata = excluded.extraction_metadata,
        extracted_at = excluded.extracted_at,
        processing_status = excluded.processing_status,
        needs_retry = excluded.needs_retry,
        retry_after = excluded.retry_after,
        updated_at = now()
      returning
        id,
        video_id,
        source,
        status,
        transcript_text,
        timed_segments,
        derived_notes,
        created_at::text,
        updated_at::text
    `;
    logIngest("transcript-fetch-completed", {
      videoId: item.video_id,
      source: freeTranscript.source,
      characters: transcriptLength,
      sourceAvailable: true,
      groundingStatus: "transcript_ready",
    });
    return rows[0];
  }

  const missingMetadata = {
    api: "youtube-transcript",
    source: freeTranscript.source,
    youtubeVideoId: item.youtube_video_id,
    sourceAvailable: false,
    transcriptLength: 0,
    fetchedAt: new Date().toISOString(),
  };
  await sql`
    insert into transcripts (
      video_id,
      source,
      status,
      transcript_length,
      extraction_metadata,
      extracted_at,
      processing_status,
      needs_retry,
      retry_after
    )
    values (
      ${item.video_id},
      ${freeTranscript.source},
      'missing',
      0,
      ${sql.json(missingMetadata)},
      now(),
      'transcript_missing',
      true,
      ${freeTranscript.retry_after}
    )
    on conflict (video_id, source) do update set
      status = excluded.status,
      transcript_text = null,
      timed_segments = null,
      derived_notes = null,
      transcript_length = excluded.transcript_length,
      extraction_metadata = excluded.extraction_metadata,
      extracted_at = excluded.extracted_at,
      processing_status = excluded.processing_status,
      needs_retry = excluded.needs_retry,
      retry_after = excluded.retry_after,
      updated_at = now()
  `;
  logIngest("transcript-missing-recorded", {
    videoId: item.video_id,
    retryAfter: freeTranscript.retry_after,
    sourceAvailable: false,
    transcriptLength: 0,
  });
  return freeTranscript;
}

export async function ensureDailyDigest(
  item: QueueItem,
  transcript: DailyDigestTranscriptRecord,
  options: { forceRegenerate?: boolean } = {},
) {
  const sql = getSql();
  const existing = await sql<
    Array<{
      id: string;
      grounding_status: string | null;
      transcript_source: string | null;
      transcript_length: number | null;
      generation_model: string | null;
      generated_at: string | null;
      full_digest_json: unknown;
    }>
  >`
    select
      id,
      grounding_status,
      transcript_source,
      transcript_length,
      generation_model,
      generated_at::text,
      full_digest_json
    from daily_digests
    where video_id = ${item.video_id}
    limit 1
  `;
  if (existing[0] && !options.forceRegenerate && isGroundedDailyDigestRow(existing[0])) {
    logIngest("daily-digest-existing", {
      videoId: item.video_id,
      digestId: existing[0].id,
      groundingStatus: existing[0].grounding_status,
      transcriptSource: existing[0].transcript_source,
      transcriptLength: existing[0].transcript_length,
    });
    return existing[0].id;
  }
  if (existing[0] && !options.forceRegenerate) {
    logIngest("daily-digest-existing-not-grounded", {
      videoId: item.video_id,
      digestId: existing[0].id,
      groundingStatus: existing[0].grounding_status,
      transcriptSource: existing[0].transcript_source,
      transcriptLength: existing[0].transcript_length,
      generationModel: existing[0].generation_model,
    });
  }

  const prompt = await loadPrompt("daily_digest");
  const digestDate = digestDateFromPublishedAt(item.published_at);
  const previousDigests = await getPreviousDailyDigests(item.creator_id, digestDate);
  logIngest("daily-digest-generation-started", {
    creatorId: item.creator_id,
    videoId: item.video_id,
    digestDate,
    transcriptSource: transcript.source,
    previousDigestCount: previousDigests.length,
  });
  const payload = await generateDailyDigestPayload({
    creatorId: item.creator_id,
    videoId: item.video_id,
    transcript,
    prompt,
    previousDailyContext: formatPreviousDailyContext(digestDate, previousDigests),
  });
  const payloadWithFollowUp = {
    ...payload,
    follow_up_from_yesterday: buildDailyFollowUp({
      current: {
        digestDate,
        title: payload.title,
        frontPageSummary: payload.front_page_summary,
        whyItMatters: payload.why_it_matters,
      },
      previous: previousDigests,
    }),
  };
  const grounding = payloadWithFollowUp.transcript_grounding;
  const sourceReferences = {
    transcriptId: transcript.id ?? null,
    transcriptSource: grounding.transcript_source,
    transcriptLength: grounding.transcript_length,
    keyExcerpts: grounding.key_excerpts,
  };

  const rows = await sql<{ id: string }[]>`
    insert into daily_digests (
      creator_id,
      video_id,
      digest_date,
      transcript_id,
      transcript_source,
      transcript_length,
      grounding_status,
      generation_model,
      generated_at,
      processing_status,
      source_references,
      layout_type,
      importance_score,
      title,
      dek,
      front_page_summary,
      plain_english_explanation,
      why_it_matters,
      what_to_do_next,
      free_learning_plan,
      glossary,
      topic_links,
      skepticism_notes,
      source_notes,
      full_digest_json
    )
    values (
      ${item.creator_id},
      ${item.video_id},
      ${digestDate},
      ${transcript.id ?? null},
      ${grounding.transcript_source},
      ${grounding.transcript_length},
      'grounded',
      ${grounding.generation_model ?? null},
      ${grounding.generation_timestamp},
      'digest_generated',
      ${sql.json(sourceReferences)},
      ${payloadWithFollowUp.layout_type},
      0.5,
      ${payloadWithFollowUp.title},
      ${payloadWithFollowUp.dek},
      ${payloadWithFollowUp.front_page_summary},
      ${payloadWithFollowUp.plain_english_explanation},
      ${payloadWithFollowUp.why_it_matters},
      ${sql.json(payloadWithFollowUp.what_to_do_next)},
      ${sql.json(payloadWithFollowUp.free_learning_plan)},
      ${sql.json(payloadWithFollowUp.glossary)},
      ${sql.json(payloadWithFollowUp.topic_links)},
      ${payloadWithFollowUp.skepticism_notes},
      ${sql.json(payloadWithFollowUp.source_notes)},
      ${sql.json(toJsonParameter(payloadWithFollowUp))}
    )
    on conflict (video_id) do update set
      digest_date = excluded.digest_date,
      transcript_id = excluded.transcript_id,
      transcript_source = excluded.transcript_source,
      transcript_length = excluded.transcript_length,
      grounding_status = excluded.grounding_status,
      generation_model = excluded.generation_model,
      generated_at = excluded.generated_at,
      processing_status = excluded.processing_status,
      source_references = excluded.source_references,
      layout_type = excluded.layout_type,
      importance_score = excluded.importance_score,
      title = excluded.title,
      dek = excluded.dek,
      front_page_summary = excluded.front_page_summary,
      plain_english_explanation = excluded.plain_english_explanation,
      why_it_matters = excluded.why_it_matters,
      what_to_do_next = excluded.what_to_do_next,
      free_learning_plan = excluded.free_learning_plan,
      glossary = excluded.glossary,
      topic_links = excluded.topic_links,
      skepticism_notes = excluded.skepticism_notes,
      source_notes = excluded.source_notes,
      full_digest_json = excluded.full_digest_json,
      updated_at = now()
    returning id
  `;
  await sql`
    update transcripts
    set status = 'failed', needs_retry = false, retry_after = null, processing_status = 'failed', updated_at = now()
    where video_id = ${item.video_id}
      and source <> 'youtube_transcript_free'
      and status = 'completed'
  `;
  logIngest("daily-digest-grounding-validated", {
    creatorId: item.creator_id,
    videoId: item.video_id,
    digestDate,
    transcriptSource: grounding.transcript_source,
    transcriptLength: grounding.transcript_length,
    groundingStatus: "grounded",
    generationModel: grounding.generation_model ?? null,
  });
  logIngest("daily-digest-db-write-completed", {
    creatorId: item.creator_id,
    videoId: item.video_id,
    digestId: rows[0].id,
    digestDate,
  });
  logIngest("daily-digest-ui-available", {
    route: `/app/daily?creatorId=${item.creator_id}&date=${digestDate}&videoId=${item.video_id}`,
  });
  return rows[0].id;
}

async function getPreviousDailyDigests(creatorId: string, digestDate: string) {
  const sql = getSql();
  const rows = await sql<
    Array<{
      digest_date: string;
      title: string;
      front_page_summary: string;
      why_it_matters: string;
    }>
  >`
    with latest_prior_date as (
      select max(digest_date) as digest_date
      from daily_digests
      where creator_id = ${creatorId}
        and digest_date < ${digestDate}
    )
    select
      daily_digests.digest_date::text as digest_date,
      daily_digests.title,
      daily_digests.front_page_summary,
      daily_digests.why_it_matters
    from daily_digests, latest_prior_date
    where daily_digests.creator_id = ${creatorId}
      and daily_digests.digest_date = latest_prior_date.digest_date
    order by daily_digests.created_at asc
  `;
  return rows.map((row) => ({
    digestDate: row.digest_date,
    title: row.title,
    frontPageSummary: row.front_page_summary,
    whyItMatters: row.why_it_matters,
  }));
}

function formatPreviousDailyContext(digestDate: string, previous: DailyFollowUpDigest[]) {
  if (!previous.length) return "No prior daily digest is available for this creator.";
  return [
    `Current digest date: ${digestDate}`,
    "Nearest prior daily digest context:",
    ...previous.map((digest) =>
      [
        `Date: ${digest.digestDate}`,
        `Title: ${digest.title}`,
        `Summary: ${digest.frontPageSummary}`,
        `Why it mattered: ${digest.whyItMatters ?? "No why-it-matters text stored."}`,
      ].join("\n"),
    ),
  ].join("\n\n");
}

function toJsonParameter(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function hashSourceText(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function syncJobCounts(jobId: string) {
  const sql = getSql();
  // A `failed` item with `completed_at IS NULL` is retry-eligible and should
  // not count as terminal — otherwise the parent job would flip to
  // `completed` while items still have pending retries scheduled.
  const rows = await sql<
    Array<{
      total_count: number;
      processed_count: number;
      failed_count: number;
      pending_failed_count: number;
      waiting_count: number;
    }>
  >`
    select
      count(*)::int as total_count,
      count(*) filter (where status = 'completed')::int as processed_count,
      count(*) filter (where status = 'failed' and completed_at is not null)::int as failed_count,
      count(*) filter (where status = 'failed' and completed_at is null)::int as pending_failed_count,
      count(*) filter (where status = 'waiting_for_transcript')::int as waiting_count
    from ingest_job_items
    where job_id = ${jobId}
  `;
  const counts = rows[0];
  const terminalCount = counts.processed_count + counts.failed_count;
  const nextStatus =
    counts.total_count === terminalCount
      ? "completed"
      : counts.waiting_count > 0
        ? "waiting_for_transcript"
        : "processing";

  await sql`
    update ingest_jobs
    set
      total_count = ${counts.total_count},
      processed_count = ${counts.processed_count},
      failed_count = ${counts.failed_count},
      status = ${nextStatus},
      completed_at = case when ${nextStatus} = 'completed' then now() else completed_at end,
      updated_at = now()
    where id = ${jobId}
  `;
}

export async function checkCreatorsForNewVideos() {
  const sql = getSql();
  const creators = await sql<Array<{ id: string; channel_url: string; user_id: string }>>`
    select distinct creators.id, creators.channel_url, user_creators.user_id
    from creators
    join user_creators on user_creators.creator_id = creators.id
    where creators.channel_url is not null
  `;

  let jobsCreated = 0;
  let videosDiscovered = 0;
  let videosQueued = 0;
  let creatorsFailed = 0;
  const discoveryLimit = numberEnv("CREATOR_DISCOVERY_LOOKBACK_LIMIT", 10);
  for (const creator of creators) {
    try {
      logIngest("creator-discovery-started", {
        creatorId: creator.id,
        discoveryLimit,
      });
      const discovery = await import("@/lib/youtube/client").then((mod) =>
        mod.discoverCreatorVideos(creator.channel_url, discoveryLimit),
      );
      videosDiscovered += discovery.videos.length;
      const mainVideos = filterDiscoveredMainVideos(discovery.videos);
      logIngest("creator-discovery-finished", {
        creatorId: creator.id,
        discoveredVideos: discovery.videos.length,
        mainVideos: mainVideos.length,
        shortsFiltered: discovery.videos.length - mainVideos.length,
        warning: discovery.warning ?? null,
      });
      const discoveredVideoIds = await import("@/lib/creators").then((mod) =>
        mod.upsertVideos(creator.id, mainVideos),
      );
      const videoIdsToQueue = await getVideoIdsNeedingIngestion(discoveredVideoIds);
      if (videoIdsToQueue.length) {
        await import("@/lib/creators").then((mod) =>
          mod.createIngestJob({
            userId: creator.user_id,
            creatorId: creator.id,
            requestedCount: videoIdsToQueue.length,
            videoIds: videoIdsToQueue,
          }),
        );
        jobsCreated += 1;
        videosQueued += videoIdsToQueue.length;
        logIngest("creator-ingest-job-created", {
          creatorId: creator.id,
          queuedVideos: videoIdsToQueue.length,
        });
      } else {
        logIngest("creator-no-ingest-needed", {
          creatorId: creator.id,
          discoveredVideos: discovery.videos.length,
        });
      }
      await sql`update creators set last_checked_at = now(), updated_at = now() where id = ${creator.id}`;
    } catch (error) {
      creatorsFailed += 1;
      console.error("[ingest:creator-discovery-failed]", {
        creatorId: creator.id,
        message: (error as Error).message,
      });
    }
  }

  if (booleanEnv("GENERATE_IMAGES", false)) {
    console.log("Image generation is enabled but runs after text digests in a later pass.");
  }

  return {
    creatorsChecked: creators.length,
    creatorsFailed,
    jobsCreated,
    videosDiscovered,
    videosQueued,
  };
}

async function getVideoIdsNeedingIngestion(videoIds: string[]) {
  const sql = getSql();
  const candidates = [];

  for (const videoId of videoIds) {
    const rows = await sql<Array<{ has_daily_digest: boolean; has_open_ingest_item: boolean }>>`
      select
        exists(
          select 1
          from daily_digests
          where video_id = ${videoId}
            and grounding_status = 'grounded'
            and processing_status = 'digest_generated'
        ) as has_daily_digest,
        exists(
          select 1
          from ingest_job_items
          where video_id = ${videoId}
            and (
              status in ('queued', 'processing', 'waiting_for_transcript', 'generating_digest', 'generating_assets')
              or (status = 'failed' and completed_at is null)
            )
        ) as has_open_ingest_item
    `;
    candidates.push({
      videoId,
      hasDailyDigest: rows[0]?.has_daily_digest ?? false,
      hasOpenIngestItem: rows[0]?.has_open_ingest_item ?? false,
    });
  }

  return selectVideoIdsNeedingIngestion(candidates);
}

function logIngest(event: string, details: Record<string, unknown>) {
  console.info(`[ingest:${event}]`, details);
}
