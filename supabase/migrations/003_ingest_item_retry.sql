-- Add retry bookkeeping to ingest_job_items so transient failures (provider
-- timeouts, grounding rejections, and stuck-`processing` items) can be auto
-- retried with backoff instead of becoming terminally `failed`.
--
-- Safe to run against an existing production database; both column additions
-- are guarded with `if not exists` and wrapped in a do-block so this migration
-- behaves the same way as `002_transcripts_unique_source.sql`.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'ingest_job_items'
      and column_name = 'retry_count'
  ) then
    alter table ingest_job_items
      add column if not exists retry_count integer not null default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'ingest_job_items'
      and column_name = 'next_retry_at'
  ) then
    alter table ingest_job_items
      add column if not exists next_retry_at timestamptz;
  end if;
end;
$$;
