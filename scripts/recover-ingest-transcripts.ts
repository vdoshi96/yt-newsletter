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
  const nonGroundedDailyRows = await countNonGroundedDailyRows();

  console.log(`${apply ? "Apply" : "Dry run"} ingest transcript recovery`);
  console.log(`waitingWithCompletedTranscript: ${waitingWithCompletedTranscript.length}`);
  console.log(`terminalFailedWithCompletedTranscript: ${terminalFailedWithCompletedTranscript.length}`);
  console.log(
    `terminalFailedFetchableTranscript: ${terminalFailedFetchableTranscript.length}${shouldFetch ? "" : " (skipped; pass --fetch or --apply)"}`,
  );
  console.log(`nonGroundedDailyRows: ${nonGroundedDailyRows}`);

  printRows("waitingWithCompletedTranscript", waitingWithCompletedTranscript);
  printRows("terminalFailedWithCompletedTranscript", terminalFailedWithCompletedTranscript);
  printRows("terminalFailedFetchableTranscript", terminalFailedFetchableTranscript);

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to reset exactly these retryable ingest items.");
    return;
  }

  const targetItemIds = [
    ...new Set([
      ...waitingWithCompletedTranscript.map((row) => row.item_id),
      ...terminalFailedWithCompletedTranscript.map((row) => row.item_id),
      ...terminalFailedFetchableTranscript.map((row) => row.item_id),
    ]),
  ];

  if (!targetItemIds.length) {
    console.log("No ingest items needed recovery.");
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
    await sql`
      update ingest_jobs
      set status = 'queued', completed_at = null, updated_at = now()
      where id = ${row.job_id}
    `;
  }

  return rows.reduce((sum, row) => sum + row.item_count, 0);
}

function printRows(label: string, rows: RecoveryRow[]) {
  if (!rows.length) return;
  console.log(`${label} sample:`);
  for (const row of rows.slice(0, 10)) {
    console.log(`- ${row.youtube_video_id} | ${row.published_at ?? "unknown"} | ${row.title ?? "(untitled)"}`);
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
