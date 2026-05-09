import { generateDailyDigestPayload } from "@/lib/ai";
import { booleanEnv, numberEnv } from "@/lib/config";
import { getSql } from "@/lib/db";
import { digestDateFromPublishedAt } from "@/lib/digests/date";
import {
  buildDailyFollowUp,
  type DailyFollowUpDigest,
} from "@/lib/digests/follow-up";
import type { DailyDigestTranscriptRecord } from "@/lib/digests/grounding";
import { selectVideoIdsNeedingIngestion } from "@/lib/ingest/discovery";
import { loadPrompt } from "@/lib/prompts";
import { fetchFreeTranscript } from "@/lib/youtube/transcripts";
import { ensureCompletedWeeklyDigestsForCreator } from "@/lib/weekly/generate";

type QueueItem = {
  item_id: string;
  job_id: string;
  creator_id: string;
  video_id: string;
  youtube_video_id: string;
  title: string;
  url: string;
  published_at: string | Date | null;
};

export async function processIngestQueue(limit = numberEnv("MAX_VIDEOS_PROCESSED_PER_CRON_RUN", 3)) {
  const sql = getSql();
  logIngest("queue-scan-started", { limit });
  const items = await sql<QueueItem[]>`
    select
      ingest_job_items.id as item_id,
      ingest_job_items.job_id,
      ingest_jobs.creator_id,
      videos.id as video_id,
      videos.youtube_video_id,
      videos.title,
      videos.url,
      videos.published_at
    from ingest_job_items
    join ingest_jobs on ingest_jobs.id = ingest_job_items.job_id
    join videos on videos.id = ingest_job_items.video_id
    where ingest_job_items.status = 'queued'
       or (
        ingest_job_items.status = 'waiting_for_transcript'
        and exists (
          select 1
          from transcripts
          where transcripts.video_id = videos.id
            and transcripts.needs_retry = true
            and transcripts.retry_after <= now()
        )
      )
    order by ingest_job_items.created_at asc
    limit ${limit}
  `;

  logIngest("queue-scan-finished", { discoveredItems: items.length, limit });
  let processed = 0;
  const touchedCreators = new Set<string>();
  for (const item of items) {
    await processQueueItem(item);
    touchedCreators.add(item.creator_id);
    processed += 1;
  }

  for (const creatorId of touchedCreators) {
    const openItems = await countOpenItemsForCreator(creatorId);
    if (openItems === 0) {
      const weekly = await ensureCompletedWeeklyDigestsForCreator({ creatorId });
      logIngest("weekly-availability-checked", {
        creatorId,
        weekCount: weekly.weekCount,
      });
    }
  }

  return { processed, limit };
}

export async function refreshCreatorsAndProcessQueue(
  limit = numberEnv("MAX_VIDEOS_PROCESSED_PER_CRON_RUN", 3),
) {
  const discovery = await checkCreatorsForNewVideos();
  const processing = await processIngestQueue(limit);

  return {
    ...discovery,
    processed: processing.processed,
    limit: processing.limit,
  };
}

async function countOpenItemsForCreator(creatorId: string) {
  const sql = getSql();
  const rows = await sql<{ count: number }[]>`
    select count(*)::int as count
    from ingest_job_items
    join ingest_jobs on ingest_jobs.id = ingest_job_items.job_id
    where ingest_jobs.creator_id = ${creatorId}
      and ingest_job_items.status in ('queued', 'processing', 'waiting_for_transcript', 'generating_digest', 'generating_assets')
  `;
  return rows[0]?.count ?? 0;
}

async function processQueueItem(item: QueueItem) {
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
    set status = 'processing', started_at = coalesce(started_at, now()), updated_at = now()
    where id = ${item.item_id}
  `;

  try {
    const transcript = await ensureTranscript(item);
    if (transcript.status === "missing") {
      logIngest("transcript-waiting", {
        itemId: item.item_id,
        videoId: item.video_id,
      });
      await sql`
        update ingest_job_items
        set status = 'waiting_for_transcript', error_message = 'Transcript missing; waiting for retry window.', updated_at = now()
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
    logIngest("summarization-started", {
      itemId: item.item_id,
      videoId: item.video_id,
      source: completedTranscript.source,
    });
    await ensureDailyDigest(item, completedTranscript);
    await sql`
      update ingest_job_items
      set status = 'completed', completed_at = now(), updated_at = now()
      where id = ${item.item_id}
    `;
    logIngest("item-completed", {
      itemId: item.item_id,
      videoId: item.video_id,
    });
  } catch (error) {
    console.error("[ingest:item-failed]", {
      itemId: item.item_id,
      jobId: item.job_id,
      videoId: item.video_id,
      message: (error as Error).message,
    });
    await sql`
      update ingest_job_items
      set status = 'failed', error_message = ${(error as Error).message}, completed_at = now(), updated_at = now()
      where id = ${item.item_id}
    `;
  } finally {
    await syncJobCounts(item.job_id);
  }
}

async function ensureTranscript(item: QueueItem) {
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
    logIngest("transcript-existing", {
      videoId: item.video_id,
      source: existing[0].source,
    });
    return existing[0];
  }

  logIngest("transcript-fetch-started", {
    videoId: item.video_id,
    youtubeVideoId: item.youtube_video_id,
  });
  const freeTranscript = await fetchFreeTranscript(item.youtube_video_id);
  if (freeTranscript.status === "completed") {
    const rows = await sql<DailyDigestTranscriptRecord[]>`
      insert into transcripts (
        video_id,
        source,
        status,
        transcript_text,
        timed_segments,
        derived_notes,
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
        false,
        null
      )
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
      characters: freeTranscript.transcript_text.length,
    });
    return rows[0];
  }

  await sql`
    insert into transcripts (
      video_id,
      source,
      status,
      needs_retry,
      retry_after
    )
    values (
      ${item.video_id},
      ${freeTranscript.source},
      'missing',
      true,
      ${freeTranscript.retry_after}
    )
  `;
  logIngest("transcript-missing-recorded", {
    videoId: item.video_id,
    retryAfter: freeTranscript.retry_after,
  });
  return freeTranscript;
}

async function ensureDailyDigest(
  item: QueueItem,
  transcript: DailyDigestTranscriptRecord,
) {
  const sql = getSql();
  const existing = await sql<{ id: string }[]>`
    select id from daily_digests where video_id = ${item.video_id} limit 1
  `;
  if (existing[0]) {
    logIngest("daily-digest-existing", {
      videoId: item.video_id,
      digestId: existing[0].id,
    });
    return existing[0].id;
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

  const rows = await sql<{ id: string }[]>`
    insert into daily_digests (
      creator_id,
      video_id,
      digest_date,
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
      updated_at = daily_digests.updated_at
    returning id
  `;
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

async function syncJobCounts(jobId: string) {
  const sql = getSql();
  const rows = await sql<
    Array<{ total_count: number; processed_count: number; failed_count: number; waiting_count: number }>
  >`
    select
      count(*)::int as total_count,
      count(*) filter (where status = 'completed')::int as processed_count,
      count(*) filter (where status = 'failed')::int as failed_count,
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
      logIngest("creator-discovery-finished", {
        creatorId: creator.id,
        discoveredVideos: discovery.videos.length,
        warning: discovery.warning ?? null,
      });
      const discoveredVideoIds = await import("@/lib/creators").then((mod) =>
        mod.upsertVideos(creator.id, discovery.videos),
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
      const weekly = await ensureCompletedWeeklyDigestsForCreator({ creatorId: creator.id });
      logIngest("weekly-availability-checked", {
        creatorId: creator.id,
        weekCount: weekly.weekCount,
      });
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
        exists(select 1 from daily_digests where video_id = ${videoId}) as has_daily_digest,
        exists(
          select 1
          from ingest_job_items
          where video_id = ${videoId}
            and status in ('queued', 'processing', 'waiting_for_transcript', 'generating_digest', 'generating_assets')
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
