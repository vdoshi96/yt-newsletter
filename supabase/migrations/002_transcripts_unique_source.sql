-- Formalize the unique constraint that already exists in production.
-- This migration is safe to run on an existing database; it is a no-op
-- if the constraint was already created manually.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transcripts_video_source_unique'
      and conrelid = 'transcripts'::regclass
  ) then
    alter table transcripts
      add constraint transcripts_video_source_unique unique (video_id, source);
  end if;
end;
$$;
