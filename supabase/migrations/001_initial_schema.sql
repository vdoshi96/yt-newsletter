create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  role text default 'user',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  session_token_hash text unique not null,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists login_attempts (
  id uuid primary key default gen_random_uuid(),
  username text,
  ip_hash text,
  success boolean,
  created_at timestamptz default now()
);

create table if not exists creators (
  id uuid primary key default gen_random_uuid(),
  youtube_channel_id text unique,
  handle text,
  title text,
  description text,
  thumbnail_url text,
  channel_url text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_checked_at timestamptz
);

create table if not exists user_creators (
  user_id uuid references app_users(id) on delete cascade,
  creator_id uuid references creators(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, creator_id)
);

create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references creators(id) on delete cascade,
  youtube_video_id text unique not null,
  title text,
  description text,
  url text,
  thumbnail_url text,
  published_at timestamptz,
  duration_seconds integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists transcripts (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references videos(id) on delete cascade,
  source text not null,
  status text not null,
  transcript_text text,
  timed_segments jsonb,
  derived_notes jsonb,
  needs_retry boolean default false,
  retry_after timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  creator_id uuid references creators(id) on delete cascade,
  requested_video_count integer,
  status text,
  total_count integer,
  processed_count integer default 0,
  failed_count integer default 0,
  current_video_id uuid references videos(id) on delete set null,
  estimated_seconds integer,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists ingest_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references ingest_jobs(id) on delete cascade,
  video_id uuid references videos(id) on delete cascade,
  status text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (job_id, video_id)
);

create table if not exists daily_digests (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references creators(id) on delete cascade,
  video_id uuid references videos(id) on delete cascade,
  digest_date date not null,
  layout_type text,
  importance_score numeric,
  title text,
  dek text,
  front_page_summary text,
  plain_english_explanation text,
  why_it_matters text,
  what_to_do_next jsonb,
  free_learning_plan jsonb,
  glossary jsonb,
  topic_links jsonb,
  skepticism_notes text,
  source_notes jsonb,
  full_digest_json jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (video_id)
);

create table if not exists weekly_digests (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references creators(id) on delete cascade,
  week_start date,
  week_end date,
  title text,
  newsletter_markdown text,
  ranked_topics jsonb,
  what_changed text,
  what_to_do_next jsonb,
  podcast_script text,
  podcast_audio_asset_id uuid,
  full_digest_json jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (creator_id, week_start)
);

create table if not exists topics (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references creators(id) on delete cascade,
  normalized_name text,
  display_name text,
  description text,
  created_at timestamptz default now(),
  unique (creator_id, normalized_name)
);

create table if not exists video_topics (
  video_id uuid references videos(id) on delete cascade,
  topic_id uuid references topics(id) on delete cascade,
  importance_score numeric,
  explanation text,
  primary key (video_id, topic_id)
);

create table if not exists topic_edges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references creators(id) on delete cascade,
  from_topic_id uuid references topics(id) on delete cascade,
  to_topic_id uuid references topics(id) on delete cascade,
  relation_type text,
  explanation text,
  created_at timestamptz default now()
);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references creators(id) on delete cascade,
  video_id uuid references videos(id) on delete cascade,
  weekly_digest_id uuid references weekly_digests(id) on delete cascade,
  asset_type text,
  provider text,
  model text,
  prompt text,
  storage_path text,
  public_url text,
  created_at timestamptz default now()
);

alter table weekly_digests
  drop constraint if exists weekly_digests_audio_asset_fk;

alter table weekly_digests
  add constraint weekly_digests_audio_asset_fk
  foreign key (podcast_audio_asset_id) references assets(id) on delete set null;

create table if not exists model_usage (
  id uuid primary key default gen_random_uuid(),
  provider text,
  model text,
  task_type text,
  creator_id uuid,
  video_id uuid,
  weekly_digest_id uuid,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric,
  created_at timestamptz default now()
);

alter table transcripts
  add column if not exists transcript_length integer,
  add column if not exists source_hash text,
  add column if not exists extraction_metadata jsonb,
  add column if not exists extracted_at timestamptz,
  add column if not exists processing_status text default 'pending';

alter table ingest_job_items
  add column if not exists processing_status text default 'pending',
  add column if not exists validation_log jsonb;

alter table daily_digests
  add column if not exists transcript_id uuid references transcripts(id) on delete set null,
  add column if not exists transcript_source text,
  add column if not exists transcript_length integer,
  add column if not exists grounding_status text default 'pending',
  add column if not exists generation_model text,
  add column if not exists generated_at timestamptz,
  add column if not exists processing_status text default 'pending',
  add column if not exists source_references jsonb;

alter table weekly_digests
  add column if not exists source_digest_count integer,
  add column if not exists source_date_range jsonb,
  add column if not exists grounding_status text default 'pending',
  add column if not exists generation_model text,
  add column if not exists generated_at timestamptz,
  add column if not exists processing_status text default 'pending',
  add column if not exists podcast_status text default 'pending',
  add column if not exists podcast_generation_metadata jsonb,
  add column if not exists podcast_generated_at timestamptz,
  add column if not exists podcast_model text,
  add column if not exists podcast_voice_config jsonb,
  add column if not exists source_references jsonb;

alter table assets
  add column if not exists generation_status text default 'pending',
  add column if not exists generation_metadata jsonb,
  add column if not exists source_references jsonb;

create index if not exists sessions_expires_at_idx on sessions (expires_at);
create index if not exists login_attempts_username_created_idx on login_attempts (lower(username), created_at desc);
create index if not exists videos_creator_published_idx on videos (creator_id, published_at desc);
create index if not exists transcripts_video_status_idx on transcripts (video_id, status);
create index if not exists transcripts_video_source_completed_idx
  on transcripts (video_id, source)
  where status = 'completed';
create index if not exists ingest_job_items_status_idx on ingest_job_items (status, created_at);
create index if not exists ingest_job_items_processing_status_idx on ingest_job_items (processing_status, created_at);
create index if not exists daily_digests_creator_date_idx on daily_digests (creator_id, digest_date desc);
create index if not exists daily_digests_grounding_status_idx on daily_digests (grounding_status, generated_at desc);
create index if not exists weekly_digests_creator_week_idx on weekly_digests (creator_id, week_start desc);
create index if not exists weekly_digests_podcast_status_idx on weekly_digests (podcast_status, podcast_generated_at desc);
create index if not exists model_usage_created_idx on model_usage (created_at desc);

drop trigger if exists set_app_users_updated_at on app_users;
create trigger set_app_users_updated_at
before update on app_users
for each row execute function set_updated_at();

drop trigger if exists set_creators_updated_at on creators;
create trigger set_creators_updated_at
before update on creators
for each row execute function set_updated_at();

drop trigger if exists set_videos_updated_at on videos;
create trigger set_videos_updated_at
before update on videos
for each row execute function set_updated_at();

drop trigger if exists set_transcripts_updated_at on transcripts;
create trigger set_transcripts_updated_at
before update on transcripts
for each row execute function set_updated_at();

drop trigger if exists set_ingest_jobs_updated_at on ingest_jobs;
create trigger set_ingest_jobs_updated_at
before update on ingest_jobs
for each row execute function set_updated_at();

drop trigger if exists set_ingest_job_items_updated_at on ingest_job_items;
create trigger set_ingest_job_items_updated_at
before update on ingest_job_items
for each row execute function set_updated_at();

drop trigger if exists set_daily_digests_updated_at on daily_digests;
create trigger set_daily_digests_updated_at
before update on daily_digests
for each row execute function set_updated_at();

drop trigger if exists set_weekly_digests_updated_at on weekly_digests;
create trigger set_weekly_digests_updated_at
before update on weekly_digests
for each row execute function set_updated_at();

alter table app_users enable row level security;
alter table sessions enable row level security;
alter table login_attempts enable row level security;
alter table creators enable row level security;
alter table user_creators enable row level security;
alter table videos enable row level security;
alter table transcripts enable row level security;
alter table ingest_jobs enable row level security;
alter table ingest_job_items enable row level security;
alter table daily_digests enable row level security;
alter table weekly_digests enable row level security;
alter table topics enable row level security;
alter table video_topics enable row level security;
alter table topic_edges enable row level security;
alter table assets enable row level security;
alter table model_usage enable row level security;

insert into storage.buckets (id, name, public)
values ('yt-newsletter-assets', 'yt-newsletter-assets', true)
on conflict (id) do nothing;
