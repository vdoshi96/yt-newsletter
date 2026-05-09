import { generateDailyDigestPayload, generateGeminiVideoNotes } from "@/lib/ai";
import { booleanEnv, numberEnv } from "@/lib/config";
import { getSql } from "@/lib/db";
import { loadPrompt } from "@/lib/prompts";
import { fetchFreeTranscript } from "@/lib/youtube/transcripts";
import { ensureWeeklyDigestForVideoWeek } from "@/lib/weekly/generate";

type QueueItem = {
  item_id: string;
  job_id: string;
  creator_id: string;
  video_id: string;
  youtube_video_id: string;
  title: string;
  url: string;
  published_at: string | null;
};

export async function processIngestQueue(limit = numberEnv("MAX_VIDEOS_PROCESSED_PER_CRON_RUN", 3)) {
  const sql = getSql();
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

  let processed = 0;
  for (const item of items) {
    await processQueueItem(item);
    processed += 1;
  }

  return { processed, limit };
}

async function processQueueItem(item: QueueItem) {
  const sql = getSql();
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

    await ensureDailyDigest(item, transcript);
    await sql`
      update ingest_job_items
      set status = 'completed', completed_at = now(), updated_at = now()
      where id = ${item.item_id}
    `;
    await ensureWeeklyDigestForVideoWeek({
      creatorId: item.creator_id,
      publishedAt: item.published_at,
    });
  } catch (error) {
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
  const existing = await sql<
    Array<{
      status: string;
      source: string;
      transcript_text: string | null;
      derived_notes: unknown | null;
    }>
  >`
    select status, source, transcript_text, derived_notes
    from transcripts
    where video_id = ${item.video_id}
      and status = 'completed'
    order by created_at desc
    limit 1
  `;

  if (existing[0]) {
    return existing[0];
  }

  const freeTranscript = await fetchFreeTranscript(item.youtube_video_id);
  if (freeTranscript.status === "completed") {
    await sql`
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
        ${JSON.stringify(freeTranscript.timed_segments)}::jsonb,
        null,
        false,
        null
      )
    `;
    return freeTranscript;
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const notes = await generateGeminiVideoNotes({
        creatorId: item.creator_id,
        videoId: item.video_id,
        youtubeUrl: item.url,
      });
      await sql`
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
          'gemini_video_derived_notes',
          'completed',
          null,
          null,
          ${JSON.stringify(notes)}::jsonb,
          true,
          ${freeTranscript.retry_after}
        )
      `;
      return {
        status: "completed",
        source: "gemini_video_derived_notes",
        transcript_text: null,
        derived_notes: notes,
      };
    } catch (error) {
      console.warn(`Gemini video fallback failed: ${(error as Error).message}`);
    }
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
  return freeTranscript;
}

async function ensureDailyDigest(
  item: QueueItem,
  transcript: {
    source: string;
    transcript_text: string | null;
    derived_notes?: unknown | null;
  },
) {
  const sql = getSql();
  const existing = await sql<{ id: string }[]>`
    select id from daily_digests where video_id = ${item.video_id} limit 1
  `;
  if (existing[0]) return existing[0].id;

  const prompt = await loadPrompt("daily_digest");
  const transcriptOrNotes =
    transcript.transcript_text ??
    JSON.stringify(transcript.derived_notes ?? {}, null, 2);
  const payload = await generateDailyDigestPayload({
    creatorId: item.creator_id,
    videoId: item.video_id,
    title: item.title,
    transcriptOrNotes,
    transcriptSource: transcript.source,
    prompt,
  });
  const digestDate = item.published_at
    ? item.published_at.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

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
      ${payload.layout_type},
      0.5,
      ${payload.title},
      ${payload.dek},
      ${payload.front_page_summary},
      ${payload.plain_english_explanation},
      ${payload.why_it_matters},
      ${JSON.stringify(payload.what_to_do_next)}::jsonb,
      ${JSON.stringify(payload.free_learning_plan)}::jsonb,
      ${JSON.stringify(payload.glossary)}::jsonb,
      ${JSON.stringify(payload.topic_links)}::jsonb,
      ${payload.skepticism_notes},
      ${JSON.stringify(payload.source_notes)}::jsonb,
      ${JSON.stringify(payload)}::jsonb
    )
    returning id
  `;
  return rows[0].id;
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
  for (const creator of creators) {
    const discovery = await import("@/lib/youtube/client").then((mod) =>
      mod.discoverCreatorVideos(creator.channel_url, 5),
    );
    const videoIds: string[] = [];
    for (const video of discovery.videos) {
      const existing = await sql<{ id: string }[]>`
        select id from videos where youtube_video_id = ${video.youtube_video_id} limit 1
      `;
      if (!existing[0]) {
        const inserted = await import("@/lib/creators").then((mod) =>
          mod.upsertVideos(creator.id, [video]),
        );
        videoIds.push(...inserted);
      }
    }
    if (videoIds.length) {
      await import("@/lib/creators").then((mod) =>
        mod.createIngestJob({
          userId: creator.user_id,
          creatorId: creator.id,
          requestedCount: videoIds.length,
          videoIds,
        }),
      );
      jobsCreated += 1;
    }
    await sql`update creators set last_checked_at = now(), updated_at = now() where id = ${creator.id}`;
  }

  if (booleanEnv("GENERATE_IMAGES", false)) {
    console.log("Image generation is enabled but runs after text digests in a later pass.");
  }

  return { creatorsChecked: creators.length, jobsCreated };
}
