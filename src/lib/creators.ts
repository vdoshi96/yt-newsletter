import { getSql } from "@/lib/db";
import { estimateIngestSeconds } from "@/lib/jobs/progress";
import type { DiscoveredCreator, DiscoveredVideo } from "@/lib/youtube/client";
import { discoverCreatorVideos } from "@/lib/youtube/client";
import type { Creator, IngestJob } from "@/lib/types";
import { getPastMonthBaselineWindow, isBaselineMainVideo } from "@/lib/baseline/month";
import { numberEnv } from "@/lib/config";

export async function getCreatorsForUser(userId: string) {
  const sql = getSql();
  return sql<Creator[]>`
    select creators.*
    from creators
    join user_creators on user_creators.creator_id = creators.id
    where user_creators.user_id = ${userId}
    order by creators.title nulls last, creators.created_at asc
  `;
}

export async function getIngestJobsForUser(userId: string) {
  const sql = getSql();
  return sql<IngestJob[]>`
    select
      ingest_jobs.*,
      creators.title as creator_title,
      videos.title as current_video_title
    from ingest_jobs
    join creators on creators.id = ingest_jobs.creator_id
    left join videos on videos.id = ingest_jobs.current_video_id
    where ingest_jobs.user_id = ${userId}
    order by ingest_jobs.created_at desc
    limit 25
  `;
}

export async function startIngestForCreatorUrl(input: {
  userId: string;
  creatorUrl: string;
  requestedCount: number;
}) {
  const maxBackfill = Number(process.env.MAX_BACKFILL_VIDEOS_PER_JOB ?? 50);
  const requestedCount = Math.max(1, Math.min(input.requestedCount, maxBackfill));
  const discovery = await discoverCreatorVideos(input.creatorUrl, requestedCount);
  const creatorId = await upsertCreator(discovery.creator);
  await linkUserCreator(input.userId, creatorId);
  const videoIds = await upsertVideos(creatorId, discovery.videos);
  const jobId = await createIngestJob({
    userId: input.userId,
    creatorId,
    requestedCount,
    videoIds,
  });

  return {
    creatorId,
    jobId,
    warning: discovery.warning,
  };
}

export async function startPastMonthBaselineForCreatorUrl(input: {
  userId: string;
  creatorUrl: string;
  now?: Date;
}) {
  const baseline = getPastMonthBaselineWindow(input.now);
  const lookbackLimit = numberEnv("BASELINE_MONTH_VIDEO_LOOKBACK_LIMIT", 150);
  const discovery = await discoverCreatorVideos(input.creatorUrl, lookbackLimit);
  const videosInBaseline = discovery.videos.filter((video) =>
    baseline.includesPublishedAt(video.published_at) && isBaselineMainVideo(video),
  );
  const creatorId = await upsertCreator(discovery.creator);
  await linkUserCreator(input.userId, creatorId);
  const videoIds = await upsertVideos(creatorId, videosInBaseline);
  const jobId = await createIngestJob({
    userId: input.userId,
    creatorId,
    requestedCount: videoIds.length,
    videoIds,
  });

  return {
    creatorId,
    jobId,
    baseline,
    videoCount: videoIds.length,
    discoveryWarning: discovery.warning,
  };
}

export async function upsertCreator(creator: DiscoveredCreator) {
  const sql = getSql();
  if (!creator.youtube_channel_id) {
    const byUrl = await sql<{ id: string }[]>`
      insert into creators (handle, title, description, thumbnail_url, channel_url)
      values (${creator.handle}, ${creator.title}, ${creator.description}, ${creator.thumbnail_url}, ${creator.channel_url})
      on conflict (channel_url) do update set
        handle = coalesce(excluded.handle, creators.handle),
        title = excluded.title,
        description = excluded.description,
        thumbnail_url = excluded.thumbnail_url,
        updated_at = now()
      returning id
    `;
    return byUrl[0].id;
  }

  const existingChannel = await sql<{ id: string }[]>`
    select id
    from creators
    where youtube_channel_id = ${creator.youtube_channel_id}
    limit 1
  `;
  if (existingChannel[0]) {
    const updated = await sql<{ id: string }[]>`
      update creators
      set
        handle = coalesce(${creator.handle}, handle),
        title = ${creator.title},
        description = ${creator.description},
        thumbnail_url = ${creator.thumbnail_url},
        channel_url = ${creator.channel_url},
        updated_at = now()
      where id = ${existingChannel[0].id}
      returning id
    `;
    return updated[0].id;
  }

  if (creator.handle) {
    const placeholders = await sql<{ id: string }[]>`
      select id
      from creators
      where youtube_channel_id is null
        and lower(handle) = lower(${creator.handle})
      order by created_at asc
      limit 1
    `;
    if (placeholders[0]) {
      const updated = await sql<{ id: string }[]>`
        update creators
        set
          youtube_channel_id = ${creator.youtube_channel_id},
          handle = ${creator.handle},
          title = ${creator.title},
          description = ${creator.description},
          thumbnail_url = ${creator.thumbnail_url},
          channel_url = ${creator.channel_url},
          updated_at = now()
        where id = ${placeholders[0].id}
        returning id
      `;
      return updated[0].id;
    }
  }

  const rows = await sql<{ id: string }[]>`
    insert into creators (
      youtube_channel_id,
      handle,
      title,
      description,
      thumbnail_url,
      channel_url
    )
    values (
      ${creator.youtube_channel_id},
      ${creator.handle},
      ${creator.title},
      ${creator.description},
      ${creator.thumbnail_url},
      ${creator.channel_url}
    )
    on conflict (youtube_channel_id) do update set
      handle = coalesce(excluded.handle, creators.handle),
      title = excluded.title,
      description = excluded.description,
      thumbnail_url = excluded.thumbnail_url,
      channel_url = excluded.channel_url,
      updated_at = now()
    returning id
  `;
  return rows[0].id;
}

export async function linkUserCreator(userId: string, creatorId: string) {
  const sql = getSql();
  await sql`
    insert into user_creators (user_id, creator_id)
    values (${userId}, ${creatorId})
    on conflict do nothing
  `;
}

export async function upsertVideos(creatorId: string, videos: DiscoveredVideo[]) {
  const sql = getSql();
  const ids: string[] = [];

  for (const video of videos) {
    const rows = await sql<{ id: string }[]>`
      insert into videos (
        creator_id,
        youtube_video_id,
        title,
        description,
        url,
        thumbnail_url,
        published_at,
        duration_seconds
      )
      values (
        ${creatorId},
        ${video.youtube_video_id},
        ${video.title},
        ${video.description},
        ${video.url},
        ${video.thumbnail_url},
        ${video.published_at},
        ${video.duration_seconds}
      )
      on conflict (youtube_video_id) do update set
        creator_id = excluded.creator_id,
        title = excluded.title,
        description = excluded.description,
        url = excluded.url,
        thumbnail_url = excluded.thumbnail_url,
        published_at = excluded.published_at,
        duration_seconds = excluded.duration_seconds,
        updated_at = now()
      returning id
    `;
    if (rows[0]?.id) ids.push(rows[0].id);
  }

  return ids;
}

export async function createIngestJob(input: {
  userId: string;
  creatorId: string;
  requestedCount: number;
  videoIds: string[];
}) {
  const sql = getSql();
  const estimatedSeconds = estimateIngestSeconds(input.videoIds.length);
  return sql.begin(async (transaction) => {
    const rows = await transaction<{ id: string }[]>`
      insert into ingest_jobs (
        user_id,
        creator_id,
        requested_video_count,
        status,
        total_count,
        estimated_seconds
      )
      values (
        ${input.userId},
        ${input.creatorId},
        ${input.requestedCount},
        ${input.videoIds.length > 0 ? "queued" : "completed"},
        ${input.videoIds.length},
        ${estimatedSeconds}
      )
      returning id
    `;
    const jobId = rows[0].id;
    let insertedCount = 0;

    for (const videoId of input.videoIds) {
      const inserted = await transaction<{ id: string }[]>`
        insert into ingest_job_items (job_id, video_id, status)
        values (${jobId}, ${videoId}, 'queued')
        on conflict (video_id) where completed_at is null
          and status in ('queued', 'processing', 'waiting_for_transcript', 'generating_digest', 'generating_assets')
        do nothing
        returning id
      `;
      insertedCount += inserted.length;
    }

    await transaction`
      update ingest_jobs
      set
        total_count = ${insertedCount},
        status = ${insertedCount > 0 ? "queued" : "completed"},
        completed_at = ${insertedCount > 0 ? null : new Date().toISOString()},
        updated_at = now()
      where id = ${jobId}
    `;

    return jobId;
  });
}

export async function seedStarterCreator() {
  const creatorId = await upsertCreator({
    youtube_channel_id: null,
    handle: "NateBJones",
    title: "Nate B. Jones",
    description: "Starter creator seeded for manual ingestion.",
    thumbnail_url: null,
    channel_url: "https://www.youtube.com/@NateBJones",
    discovery_mode: "youtube_api",
  });
  return creatorId;
}
