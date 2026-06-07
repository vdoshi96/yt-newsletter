# Log

## 2026-06-07 Weekly Podcast Retirement and Date Keyboard Navigation

Retired the weekly podcast feature and pipeline. Removed the podcast page, app navigation item, Vercel cron route, generation scripts, prompt, TTS/audio upload code, Supabase Storage dependency path, and podcast-specific tests. Daily and weekly digest views now support left/right arrow-key date navigation when focus is not inside a form control.

## 2026-05-27 Catalog Boundary and Backlog Recovery

Added a durable `CATALOG_START_DATE=2026-03-01` boundary so daily views and weekly generation/archive selection ignore older seeded or experimental rows.

## 2026-05-26 Daily Ingestion Reliability Follow-Up

Implemented the consensus reliability path from the model review notes: transcript waits can recover immediately when a completed `youtube_transcript_free` row exists, hourly transcript retries shift to an extended cadence instead of producing final content, transcript fetches have a configurable timeout, stale `processing` rows are bounded by the retry budget, and queue scans log candidate counts by status. Added `npm run ingest:recover` as a dry-run-first command for wedged transcript rows and moved weekly generation fully behind the dedicated weekly cron so daily discovery/processing budgets stay focused on daily availability.

Follow-up recovery hardening: collapsed duplicate open ingest rows before adding the partial unique index `ingest_job_items_one_open_item_per_video_idx`, changed ingest job creation to ignore an already-open video item across jobs, prioritized completed/due transcript waits before stale queued backlog, and expanded `npm run ingest:recover` to detect fetchable waiting rows and duplicate open rows. Added bounded worker-pool execution for daily ingest processing and weekly digest refreshes through `INGEST_PROCESS_CONCURRENCY` and `WEEKLY_DIGEST_CONCURRENCY`, keeping provider rate-limit pressure configurable while allowing back-catalog batches to finish faster.

## 2026-05-16 Editorial Quality + DeepSeek V4 Pro Pass

Resolved stale Claude worktrees/branches after preserving patch evidence outside the repo. Verified the official DeepSeek V4 Pro docs and switched the app's high-quality generation route from compatibility aliases to `deepseek-v4-pro` with thinking enabled, longer DeepSeek timeout, no default app-level daily/weekly output cap, explicit retry-before-fallback behavior, response-body error logging, and model/attempt logs. Daily digest rendering now removes the redundant CS-background panel, breaks long sections into paragraphs, hides timestamp-heavy transcript excerpt lists, and keeps transcript grounding to status, transcript source, and model used. Weekly digest rendering now hides weekly post cards/source notes, jumps to the latest published completed week, and has an explicit Saturday cron route. Dashboard daily count now reflects recent grounded long-form digests rather than all historical rows.

## 2026-05-16 Daily Digest Retry Fix

User reported daily digests still were not being generated after the recent ingest fixes. Reviewing PRs showed #1 intended freshness/discovery recovery, #2 enforced transcript-only daily grounding, and #3 hardened back-catalog/idempotency/retry behavior. Live DB evidence showed recent long-form uploads were discovered and queued, but stuck in `waiting_for_transcript` with 24-hour `retry_after` values even though `youtube-transcript` could fetch those transcripts now. Fixed transcript retries to default to hourly `TRANSCRIPT_RETRY_MINUTES`, recover legacy future `retry_after` waits after the shorter window, track transcript-missing attempts with a separate default budget (`TRANSCRIPT_MAX_RETRY_ATTEMPTS=48`), prioritize fresh videos, skip non-main/short videos terminally, and normalize harmless model `layout_type` variants before daily schema validation. A live one-item processor run generated the 2026-05-15 daily digest from a 17,723-character `youtube_transcript_free` transcript using `qwen:qwen3-max`.

Follow-up completion: regenerated and audited all main long-form daily digests from 2026-05-01 through 2026-05-16, each with full beginner/intermediate/advanced digest versions. Regenerated the completed May-covering weekly windows (`2026-04-25`, `2026-05-02`, `2026-05-09`) with DeepSeek first and source references. The weekly podcast assets from that period were later retired.

## 2026-05-13 Ingest Retry Mechanism

Followed up on H4 from the cron investigation. Added a retry/backoff path to `ingest_job_items` so transient AI errors, grounding failures, and stuck-`processing` rows (timeout/crash before the catch) no longer become permanently terminal. New columns `retry_count` and `next_retry_at` track attempts; the dequeue SQL in `processIngestQueue` now also picks up `failed` rows whose `next_retry_at` has elapsed and `processing` rows older than the retry delay window. The `processQueueItem` catch block reads the current `retry_count`, schedules a retry by default, and only writes `completed_at = now()` once `INGEST_ITEM_MAX_RETRIES` is exhausted (logged as `[ingest:item-retry-scheduled]` / `[ingest:item-retry-exhausted]`). `syncJobCounts` was adjusted so a parent job is not marked `completed` while child items still have pending retries. Knobs: `INGEST_ITEM_MAX_RETRIES` (default 5), `INGEST_ITEM_RETRY_DELAY_SECONDS` (default 3600). Pure helper `shouldRetryItem` in `src/lib/ingest/retry.ts` mirrors the SQL predicate and is covered by `tests/ingest-retry.test.ts`. New migration `003_ingest_item_retry.sql` (idempotent); `001_initial_schema.sql` updated to include the columns for fresh deploys.

## 2026-05-13 Cron Ingestion Investigation + Fix

User reported the scheduled cron is not ingesting videos automatically. Investigation identified eight ranked hypotheses. Live error log then confirmed the immediate crash: both `INSERT INTO transcripts` statements in `ensureTranscript` (processor.ts) had no `ON CONFLICT` clause, so any retry after a `missing`-transcript insertion would hit the production `transcripts_video_source_unique` constraint and crash the item to `failed`. Fixed both INSERTs with `ON CONFLICT (video_id, source) DO UPDATE SET ...`. Added `supabase/migrations/002_transcripts_unique_source.sql` to formalize the constraint for fresh deploys. TypeScript clean, 124/124 tests passing. Items already in `failed` due to this bug can be reset with the SQL in the investigation doc. H1–H3 (cron schedule plan, CRON_SECRET, function timeout) remain open and should be validated via Vercel dashboard. See [docs/wiki/cron-ingestion-investigation-2026-05-13.md](../wiki/cron-ingestion-investigation-2026-05-13.md).

## 2026-05-09

Initial local build session. Created the Next.js app, schema, auth, ingestion processor, UI pages, prompts, setup scripts, tests, and documentation. Migration and seed were blocked by invalid database credentials in `.env.local`.

## 2026-05-09 Baseline Update

Added a one-month baseline flow: the creator form now defaults to “Past month,” settings has a “Seed past month baseline” action for Nate B. Jones, and `npm run seed:baseline -- --process` can populate the baseline.

## 2026-05-09 Baseline Methodology Fix

Confirmed the initial 50-video baseline count was wrong because it counted all uploads, including Shorts and short clips. Updated baseline discovery to fetch deeper, filter to main videos by duration/title, merge the placeholder creator into the resolved YouTube channel, and regenerate live starter data as 24 main daily digests plus four weekly digests.

## 2026-05-09 Logout Navigation Fix

Confirmed protected tabs appeared to kick users out because the app shell rendered logout as a Next `<Link>` to a destructive GET route. Browser/router prefetch could call `/logout`, delete the session, and make the next tab click redirect to login. Logout now uses an explicit server action form, and GET `/logout` only redirects to login without deleting the session.

## 2026-05-09 Explanation Levels

Added beginner, intermediate, and advanced explanation levels to daily and weekly digest JSON contracts. Daily and weekly pages now show a Level dropdown, and weekly synthesis source text carries all three daily explanation levels forward so weekly digests can summarize at each reader level.

## 2026-05-09 Retired Two-Host Qwen Podcast Experiment

Added an early two-host audio experiment. This path was retired on 2026-06-07.

## 2026-05-09 Weekly Archive Rework

Reworked weekly digests from a latest-four recap into a stored "This Week in AI" archive. The first backfill still starts with four weekly editions because it covers the past 28 days, but future completed Sunday-to-Saturday weeks and larger backfills remain stored. Weekly payloads now include an executive insights memo, board-level implications, market/investment lens, about 10 weekly posts, deep research briefs, source notes, and beginner/intermediate/advanced explanations.

## 2026-05-09 Daily Follow-Up Fix

Fixed daily "follow-up from yesterday" continuity. Daily generation now receives prior-digest context and stores a deterministic source-backed bridge to the nearest previous daily digest. Added `npm run daily:refresh-follow-ups` and refreshed the live starter daily rows.

## 2026-05-09 Freshness and Calendar Fixes

Updated creator discovery to run hourly, queue previously missed known videos, and log discovery, transcript, summarization, DB write, and UI availability stages. The admin manual refresh now discovers uploads before processing the queue.

Added weekly calendar navigation for weekly digest pages, daily/weekly "Jump to current" controls, weekly story links to matching daily digest dates, source-note panel removal, skepticism wording cleanup, deeper explanation prompt instructions, follow-up overflow hardening, and weekly markdown artifact cleanup.

## 2026-05-09 Retired Gemini Podcast Host Experiment

Switched the old automated podcast experiment to Gemini Flash native multi-speaker TTS. This path was retired on 2026-06-07.

## 2026-05-09 Daily Digest Grounding Incident

Confirmed two 2026-05-09 daily digests were generated from zero-character `gemini_video_derived_notes` rows after transcript fetch missed, then the queue marked those items completed. Added a hard transcript validation gate, removed daily title/metadata and Gemini-note fallback paths, required transcript quote anchors after generation, separated Plain English from the three CS-background levels, added `npm run daily:regenerate`, and regenerated both affected rows from verified `youtube_transcript_free` transcripts. The old Gemini-derived transcript rows are now marked `failed`.
