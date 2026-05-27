import "./load-env";
import { closeSql, getSql } from "@/lib/db";
import { fetchFreeTranscript } from "@/lib/youtube/transcripts";

type RecoveryRow = {
  item_id: string;
  job_id: string;
  video_id: string;
  youtube_video_id: string;
  title: string | null;
  published_at: string | null;
};

type DuplicateOpenIngestRow = RecoveryRow & {
  status: string;
  processing_status: string | null;
  duplicate_rank: number;
  open_item_count: number;
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
  const apply = args.has("apply");
  const limit = numericArg("limit", 25);
  const shouldFetch = apply || args.has("fetch");

  const waitingWithCompletedTranscript = await getWaitingWithCompletedTranscript(limit);
  const terminalFailedWithCompletedTranscript = await getTerminalFailedWithCompletedTranscript(limit);
  const terminalFailedFetchableTranscript = shouldFetch
    ? await getTerminalFailedFetchableTranscript(limit)
    : [];
  const waitingFetchableTranscript = shouldFetch
    ? await getWaitingFetchableTranscript(limit)
    : [];
  const duplicateOpenIngestRows = await getDuplicateOpenIngestRows(limit);
  const nonGroundedDailyRows = await countNonGroundedDailyRows();

  console.log(`${apply ? "Apply" : "Dry run"} ingest transcript recovery`);
  console.log(`waitingWithCompletedTranscript: ${waitingWithCompletedTranscript.length}`);
  console.log(`terminalFailedWithCompletedTranscript: ${terminalFailedWithCompletedTranscript.length}`);
  console.log(
    `terminalFailedFetchableTranscript: ${terminalFailedFetchableTranscript.length}${shouldFetch ? "" : " (skipped; pass --fetch or --apply)"}`,
  );
  console.log(
    `waitingFetchableTranscript: ${waitingFetchableTranscript.length}${shouldFetch ? "" : " (skipped; pass --fetch or --apply)"}`,
  );
  console.log(`duplicateOpenIngestRows: ${duplicateOpenIngestRows.length}`);
  console.log(`nonGroundedDailyRows: ${nonGroundedDailyRows}`);

  printRows("waitingWithCompletedTranscript", waitingWithCompletedTranscript);
  printRows("terminalFailedWithCompletedTranscript", terminalFailedWithCompletedTranscript);
  printRows("terminalFailedFetchableTranscript", terminalFailedFetchableTranscript);
  printRows("waitingFetchableTranscript", waitingFetchableTranscript);
  printDuplicateRows("duplicateOpenIngestRows", duplicateOpenIngestRows);

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to reset exactly these retryable ingest items.");
    return;
  }

  const collapsedDuplicateCount = await collapseDuplicateOpenIngestRows();
  if (collapsedDuplicateCount > 0) {
    console.log(`Collapsed ${collapsedDuplicateCount} duplicate open ingest item(s).`);
  }

  const acceleratedWaitingCount = await accelerateWaitingItems(
    waitingFetchableTranscript.map((row) => row.item_id),
  );
  if (acceleratedWaitingCount > 0) {
    console.log(`Accelerated ${acceleratedWaitingCount} fetchable waiting item(s).`);
  }

  const targetItemIds = [
    ...new Set([
      ...waitingWithCompletedTranscript.map((row) => row.item_id),
      ...terminalFailedWithCompletedTranscript.map((row) => row.item_id),
      ...terminalFailedFetchableTranscript.map((row) => row.item_id),
    ]),
  ];

  if (!targetItemIds.length) {
    if (collapsedDuplicateCount === 0 && acceleratedWaitingCount === 0) {
      console.log("No ingest items needed recovery.");
    }
    return;
  }

  const resetCount = await resetIngestItems(targetItemIds);
  console.log(`Reset ${resetCount} ingest item(s) to queued.`);
}

async function getWaitingWithCompletedTranscript(limit: number) {
  const sql = getSql();
  return sql<RecoveryRow[]>`
    select
      ingest_job_items.id as item_id,
      ingest_job_items.job_id,
      videos.id as video_id,
      videos.youtube_video_id,
      videos.title,
      videos.published_at::text
    from ingest_job_items
    join videos on videos.id = ingest_job_items.video_id
    where ingest_job_items.status = 'waiting_for_transcript'
      and ingest_job_items.completed_at is null
      and exists (
        select 1
        from transcripts
        where transcripts.video_id = videos.id
          and transcripts.source = 'youtube_transcript_free'
          and transcripts.status = 'completed'
          and transcripts.transcript_text is not null
      )
    order by videos.published_at desc nulls last, ingest_job_items.created_at asc
    limit ${limit}
  `;
}

async function getTerminalFailedWithCompletedTranscript(limit: number) {
  const sql = getSql();
  return sql<RecoveryRow[]>`
    select
      ingest_job_items.id as item_id,
      ingest_job_items.job_id,
      videos.id as video_id,
      videos.youtube_video_id,
      videos.title,
      videos.published_at::text
    from ingest_job_items
    join videos on videos.id = ingest_job_items.video_id
    where ingest_job_items.status = 'failed'
      and ingest_job_items.completed_at is not null
      and (
        ingest_job_items.processing_status = 'transcript_missing'
        or ingest_job_items.error_message ilike '%transcript missing%'
        or ingest_job_items.error_message ilike '%transcript%'
      )
      and exists (
        select 1
        from transcripts
        where transcripts.video_id = videos.id
          and transcripts.source = 'youtube_transcript_free'
          and transcripts.status = 'completed'
          and transcripts.transcript_text is not null
      )
    order by videos.published_at desc nulls last, ingest_job_items.created_at asc
    limit ${limit}
  `;
}

async function getTerminalFailedFetchableTranscript(limit: number) {
  const rows = await getTerminalFailedTranscriptRowsWithoutCompletedTranscript(limit);
  const fetchable: RecoveryRow[] = [];

  for (const row of rows) {
    const transcript = await fetchFreeTranscript(row.youtube_video_id);
    if (transcript.status === "completed") {
      fetchable.push(row);
    }
  }

  return fetchable;
}

async function getWaitingFetchableTranscript(limit: number) {
  const rows = await getWaitingTranscriptRowsWithoutCompletedTranscript(limit);
  const fetchable: RecoveryRow[] = [];

  for (const row of rows) {
    const transcript = await fetchFreeTranscript(row.youtube_video_id);
    if (transcript.status === "completed") {
      fetchable.push(row);
    }
  }

  return fetchable;
}

async function getWaitingTranscriptRowsWithoutCompletedTranscript(limit: number) {
  const sql = getSql();
  return sql<RecoveryRow[]>`
    select distinct on (videos.id)
      ingest_job_items.id as item_id,
      ingest_job_items.job_id,
      videos.id as video_id,
      videos.youtube_video_id,
      videos.title,
      videos.published_at::text
    from ingest_job_items
    join videos on videos.id = ingest_job_items.video_id
    where ingest_job_items.status = 'waiting_for_transcript'
      and ingest_job_items.completed_at is null
      and not exists (
        select 1
        from transcripts
        where transcripts.video_id = videos.id
          and transcripts.source = 'youtube_transcript_free'
          and transcripts.status = 'completed'
          and transcripts.transcript_text is not null
      )
    order by videos.id, videos.published_at desc nulls last, ingest_job_items.created_at desc
    limit ${limit}
  `;
}

async function getTerminalFailedTranscriptRowsWithoutCompletedTranscript(limit: number) {
  const sql = getSql();
  return sql<RecoveryRow[]>`
    select
      ingest_job_items.id as item_id,
      ingest_job_items.job_id,
      videos.id as video_id,
      videos.youtube_video_id,
      videos.title,
      videos.published_at::text
    from ingest_job_items
    join videos on videos.id = ingest_job_items.video_id
    where ingest_job_items.status = 'failed'
      and ingest_job_items.completed_at is not null
      and (
        ingest_job_items.processing_status = 'transcript_missing'
        or ingest_job_items.error_message ilike '%transcript missing%'
        or ingest_job_items.error_message ilike '%transcript%'
      )
      and not exists (
        select 1
        from transcripts
        where transcripts.video_id = videos.id
          and transcripts.source = 'youtube_transcript_free'
          and transcripts.status = 'completed'
          and transcripts.transcript_text is not null
      )
    order by videos.published_at desc nulls last, ingest_job_items.created_at asc
    limit ${limit}
  `;
}

async function countNonGroundedDailyRows() {
  const sql = getSql();
  const rows = await sql<Array<{ count: number }>>`
    select count(*)::int as count
    from daily_digests
    where coalesce(grounding_status, '') <> 'grounded'
       or coalesce(processing_status, '') <> 'digest_generated'
  `;
  return rows[0]?.count ?? 0;
}

async function getDuplicateOpenIngestRows(limit: number) {
  const sql = getSql();
  return sql<DuplicateOpenIngestRow[]>`
    with ranked as (
      select
        ingest_job_items.id as item_id,
        ingest_job_items.job_id,
        videos.id as video_id,
        videos.youtube_video_id,
        videos.title,
        videos.published_at::text,
        ingest_job_items.status,
        ingest_job_items.processing_status,
        row_number() over (
          partition by ingest_job_items.video_id
          order by
            case
              when exists (
                select 1
                from transcripts
                where transcripts.video_id = ingest_job_items.video_id
                  and transcripts.source = 'youtube_transcript_free'
                  and transcripts.status = 'completed'
                  and transcripts.transcript_text is not null
              ) then 0
              when ingest_job_items.status = 'waiting_for_transcript'
                and ingest_job_items.next_retry_at <= now() then 1
              when ingest_job_items.status = 'queued' then 2
              when ingest_job_items.status = 'waiting_for_transcript' then 3
              when ingest_job_items.status = 'processing' then 4
              else 5
            end,
            coalesce(ingest_job_items.next_retry_at, ingest_job_items.created_at) asc,
            ingest_job_items.created_at desc,
            ingest_job_items.id desc
        ) as duplicate_rank,
        count(*) over (partition by ingest_job_items.video_id)::int as open_item_count
      from ingest_job_items
      join videos on videos.id = ingest_job_items.video_id
      where ingest_job_items.completed_at is null
        and ingest_job_items.status in (
          'queued',
          'processing',
          'waiting_for_transcript',
          'generating_digest',
          'generating_assets'
        )
    )
    select *
    from ranked
    where duplicate_rank > 1
    order by published_at desc nulls last, youtube_video_id, duplicate_rank asc
    limit ${limit}
  `;
}

async function collapseDuplicateOpenIngestRows() {
  const sql = getSql();
  const rows = await sql<Array<{ job_id: string; item_count: number }>>`
    with ranked as (
      select
        ingest_job_items.id,
        row_number() over (
          partition by ingest_job_items.video_id
          order by
            case
              when exists (
                select 1
                from transcripts
                where transcripts.video_id = ingest_job_items.video_id
                  and transcripts.source = 'youtube_transcript_free'
                  and transcripts.status = 'completed'
                  and transcripts.transcript_text is not null
              ) then 0
              when ingest_job_items.status = 'waiting_for_transcript'
                and ingest_job_items.next_retry_at <= now() then 1
              when ingest_job_items.status = 'queued' then 2
              when ingest_job_items.status = 'waiting_for_transcript' then 3
              when ingest_job_items.status = 'processing' then 4
              else 5
            end,
            coalesce(ingest_job_items.next_retry_at, ingest_job_items.created_at) asc,
            ingest_job_items.created_at desc,
            ingest_job_items.id desc
        ) as duplicate_rank
      from ingest_job_items
      where ingest_job_items.completed_at is null
        and ingest_job_items.status in (
          'queued',
          'processing',
          'waiting_for_transcript',
          'generating_digest',
          'generating_assets'
        )
    ),
    collapsed as (
      update ingest_job_items
      set
        status = 'failed',
        processing_status = 'failed',
        error_message = 'Duplicate open ingest item collapsed by recovery command.',
        next_retry_at = null,
        completed_at = now(),
        validation_log = coalesce(validation_log, '{}'::jsonb) || jsonb_build_object(
          'event', 'duplicate_open_ingest_collapsed',
          'timestamp', now()
        ),
        updated_at = now()
      where id in (
        select id
        from ranked
        where duplicate_rank > 1
      )
      returning job_id
    )
    select job_id, count(*)::int as item_count
    from collapsed
    group by job_id
  `;

  await refreshIngestJobs(rows.map((row) => row.job_id));
  return rows.reduce((sum, row) => sum + row.item_count, 0);
}

async function accelerateWaitingItems(itemIds: string[]) {
  if (!itemIds.length) return 0;
  const sql = getSql();
  const rows = await sql<Array<{ job_id: string; item_count: number }>>`
    with accelerated as (
      update ingest_job_items
      set
        next_retry_at = now(),
        validation_log = coalesce(validation_log, '{}'::jsonb) || jsonb_build_object(
          'event', 'fetchable_waiting_transcript_accelerated',
          'timestamp', now()
        ),
        updated_at = now()
      where id = any(${itemIds}::uuid[])
        and status = 'waiting_for_transcript'
        and completed_at is null
      returning job_id
    )
    select job_id, count(*)::int as item_count
    from accelerated
    group by job_id
  `;
  await refreshIngestJobs(rows.map((row) => row.job_id));
  return rows.reduce((sum, row) => sum + row.item_count, 0);
}

async function resetIngestItems(itemIds: string[]) {
  const sql = getSql();
  const rows = await sql<Array<{ job_id: string; item_count: number }>>`
    with reset as (
      update ingest_job_items
      set
        status = 'queued',
        processing_status = 'pending',
        error_message = null,
        retry_count = 0,
        next_retry_at = null,
        completed_at = null,
        validation_log = coalesce(validation_log, '{}'::jsonb) || jsonb_build_object(
          'event', 'targeted_transcript_recovery',
          'timestamp', now()
        ),
        updated_at = now()
      where id = any(${itemIds}::uuid[])
      returning job_id
    )
    select job_id, count(*)::int as item_count
    from reset
    group by job_id
  `;

  for (const row of rows) {
    await refreshIngestJobs([row.job_id]);
  }

  return rows.reduce((sum, row) => sum + row.item_count, 0);
}

async function refreshIngestJobs(jobIds: string[]) {
  const uniqueJobIds = [...new Set(jobIds)];
  if (!uniqueJobIds.length) return;
  const sql = getSql();
  for (const jobId of uniqueJobIds) {
    const rows = await sql<Array<{
      total_count: number;
      processed_count: number;
      failed_count: number;
      pending_failed_count: number;
      waiting_count: number;
      queued_count: number;
      processing_count: number;
    }>>`
      select
        count(*)::int as total_count,
        count(*) filter (where status = 'completed')::int as processed_count,
        count(*) filter (where status = 'failed' and completed_at is not null)::int as failed_count,
        count(*) filter (where status = 'failed' and completed_at is null)::int as pending_failed_count,
        count(*) filter (where status = 'waiting_for_transcript')::int as waiting_count,
        count(*) filter (where status = 'queued')::int as queued_count,
        count(*) filter (where status in ('processing', 'generating_digest', 'generating_assets'))::int as processing_count
      from ingest_job_items
      where job_id = ${jobId}
    `;
    const counts = rows[0];
    if (!counts) continue;
    const terminalCount = counts.processed_count + counts.failed_count;
    const status =
      counts.total_count === terminalCount
        ? "completed"
        : counts.waiting_count > 0
          ? "waiting_for_transcript"
          : counts.queued_count > 0
            ? "queued"
            : counts.pending_failed_count > 0 || counts.processing_count > 0
              ? "processing"
              : "completed";

    await sql`
      update ingest_jobs
      set
        status = ${status},
        total_count = ${counts.total_count},
        processed_count = ${counts.processed_count},
        failed_count = ${counts.failed_count},
        completed_at = case when ${status} = 'completed' then coalesce(completed_at, now()) else null end,
        updated_at = now()
      where id = ${jobId}
    `;
  }
}

function printRows(label: string, rows: RecoveryRow[]) {
  if (!rows.length) return;
  console.log(`${label} sample:`);
  for (const row of rows.slice(0, 10)) {
    console.log(`- ${row.youtube_video_id} | ${row.published_at ?? "unknown"} | ${row.title ?? "(untitled)"}`);
  }
}

function printDuplicateRows(label: string, rows: DuplicateOpenIngestRow[]) {
  if (!rows.length) return;
  console.log(`${label} sample:`);
  for (const row of rows.slice(0, 10)) {
    console.log(
      `- ${row.youtube_video_id} | ${row.published_at ?? "unknown"} | ${row.status}/${row.processing_status ?? "pending"} | duplicate ${row.duplicate_rank} of ${row.open_item_count} | ${row.title ?? "(untitled)"}`,
    );
  }
}

function numericArg(name: string, fallback: number) {
  const value = Number(args.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSql();
  });
