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
- Baseline flow for Nate B. Jones that starts with four completed weekly editions
- Weekly digest archive behavior for completed Saturday-to-Friday weeks
- Baseline video filtering that excludes Shorts-style and very short clips from the live starter data
- Daily and weekly digest explanation levels: beginner, intermediate, and advanced
- Hourly creator discovery plus five-minute queue processing for fresher daily digests
- Admin/manual refresh that discovers YouTube uploads and processes the queue
- Approximately 30-minute two-host weekly podcast scripts with configurable target length and TTS settings
- Two-host weekly podcast MP3 generation with Gemini Flash rotating host casts; existing stored MP3s may include earlier Qwen-generated assets
- Grounded back-catalog regeneration command with force/dry-run controls and idempotent daily/weekly/podcast metadata
- Weekly digest and podcast calendar navigation
- Prompt files and Zod validation
- Focused tests for parsing, auth, schemas, progress, and date/video selection
- Hard transcript-grounding gate for daily digests and safe daily regeneration command

## Verification

Last known local checks:

- `npm test`: passing, 47+ tests
- `npm run lint`: passing
- `npx tsc --noEmit`: passing
- `npm run build`: passing

## Deployment Notes

- Local `DATABASE_URL` and `DIRECT_URL` authenticate after rebuilding their embedded password from `DATABASE_PASSWORD`.
- If production still shows a Postgres auth error, refresh Vercel's `DATABASE_URL` with the same URL-encoded password value used locally, then redeploy.

## Open Blockers

- **2026-05-13 — Scheduled cron ingestion bug (partially fixed).** The immediate crash — duplicate-key error on `transcripts_video_source_unique` — is fixed in `src/lib/processor.ts` (both transcript INSERTs now use `ON CONFLICT … DO UPDATE`). Any `ingest_job_items` stuck in `failed` due to this error should be reset to `queued` with the SQL in the investigation doc. H4 (no recovery path for stuck/failed items) is now fixed: a retry/backoff mechanism with `retry_count` + `next_retry_at` columns lets the dequeue re-pick `failed` items (including grounding rejections) and auto-unstick `processing` items older than 1 h, up to 5 attempts. Knobs: `INGEST_ITEM_MAX_RETRIES`, `INGEST_ITEM_RETRY_DELAY_SECONDS`. H1–H3 (Vercel plan schedule caps, `CRON_SECRET`, function timeout / no `maxDuration`) remain open; validate via the Vercel dashboard before closing. See [Cron Ingestion Investigation: 2026-05-13](../wiki/cron-ingestion-investigation-2026-05-13.md).
