with ranked_open_ingest_items as (
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
)
update ingest_job_items
set
  status = 'failed',
  processing_status = 'failed',
  error_message = 'Duplicate open ingest item collapsed before unique open-item index.',
  next_retry_at = null,
  completed_at = now(),
  validation_log = coalesce(validation_log, '{}'::jsonb) || jsonb_build_object(
    'event', 'duplicate_open_ingest_collapsed',
    'timestamp', now()
  ),
  updated_at = now()
where id in (
  select id
  from ranked_open_ingest_items
  where duplicate_rank > 1
);

create unique index if not exists ingest_job_items_one_open_item_per_video_idx
  on ingest_job_items (video_id)
  where completed_at is null
    and status in (
      'queued',
      'processing',
      'waiting_for_transcript',
      'generating_digest',
      'generating_assets'
    );
