# Status

## Current Phase

Phase 1/2 MVP scaffold is implemented and seeded against the live Supabase database.

## What Exists

- Next.js App Router app shell
- Custom Argon2id login/session code
- Supabase SQL migration
- Seed scripts
- Creator ingestion job creation
- Queue processor endpoints and manual runner
- Daily digest UI
- Weekly digest and podcast pages
- Baseline flow for Nate B. Jones plus a durable March 1, 2026 catalog boundary
- Weekly digest archive behavior for completed Saturday-to-Friday weeks from the catalog start
- Baseline video filtering that excludes Shorts-style and very short clips from the live starter data
- Daily and weekly digest explanation levels: beginner, practitioner, and advanced
- Hourly creator discovery plus five-minute queue processing for fresher daily digests
- Admin/manual refresh that discovers YouTube uploads and processes the queue
- 2026-05-01 through 2026-05-16 main long-form daily digests regenerated and audited from verified transcripts
- DeepSeek V4 Pro primary route for high-quality daily, weekly, and provider-authored podcast scripts
- Completed May-covering weekly digests regenerated with DeepSeek and source references
- Completed May-covering weekly podcasts generated as QA-passed Gemini assets
- Approximately 30-minute two-host weekly podcast scripts with configurable target length and TTS settings
- Two-host weekly podcast MP3 generation with Gemini Flash rotating Maya/Theo and Nina/Jonah host casts; existing stored MP3s may include earlier Qwen-generated assets
- Grounded back-catalog regeneration command with force/dry-run controls and idempotent daily/weekly/podcast metadata
- Weekly digest and podcast calendar navigation, with weekly archive jumping to the latest published completed edition
- Prompt files and Zod validation
- Focused tests for parsing, auth, schemas, progress, and date/video selection
- Hard transcript-grounding gate for daily digests and safe daily regeneration command
- Hourly transcript retry recovery for daily uploads that were parked behind legacy 24-hour retry windows
- Extended transcript retries after the hourly retry budget, so missing transcripts stay blocked/retryable instead of terminally failing
- Daily podcast-audio cron retry path for ready catalog weekly rows with missing or failed audio
- Bounded batch worker pools for daily ingest processing, weekly digest synthesis, and podcast generation, controlled by `INGEST_PROCESS_CONCURRENCY`, `WEEKLY_DIGEST_CONCURRENCY`, and `PODCAST_GENERATION_CONCURRENCY`

## Verification

Last known local checks:

- `2026-05-26 npm test`: passing, 137 tests
- `2026-05-26 npm run lint`: passing
- `2026-05-26 npx tsc --noEmit`: passing
- `2026-05-26 npm run build`: passing
- `2026-05-26 browser QA`: local authenticated dashboard, recovered grounded daily digest, jobs, weekly archive, and podcasts rendered without console errors after restarting against restored `.env.local`

## Deployment Notes

- Local `DATABASE_URL` and `DIRECT_URL` authenticate after rebuilding their embedded password from `DATABASE_PASSWORD`.
- If production still shows a Postgres auth error, refresh Vercel's `DATABASE_URL` with the same URL-encoded password value used locally, then redeploy.
- `2026-05-26`: Vercel production env was refreshed for `CRON_SECRET`, one-video cron processing, transcript retry/timeout knobs, DeepSeek provider timeout, and podcast retry limit.

## Open Blockers

- **2026-05-26 — Daily ingestion reliability follow-up.** The active fix set keeps transcript waits retryable on an extended cadence after the hourly retry budget, bounds transcript fetches with `TRANSCRIPT_FETCH_TIMEOUT_MS`, reconciles waiting rows when a completed verified transcript exists, prevents exhausted stale `processing` rows from reclaiming forever, prevents duplicate open ingest rows per video, and adds `npm run ingest:recover` as the dry-run-first recovery path for rows wedged by old transcript behavior. Daily discovery/processing no longer runs weekly generation inline; weekly and podcast work stay behind dedicated cron routes with bounded parallel batch execution. `2026-06-04`: TranscriptAPI fallback is enabled only after the first scraper miss is older than `TRANSCRIPT_API_FALLBACK_AFTER_HOURS` hours so the scraper remains the default path.
