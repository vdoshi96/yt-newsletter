# Project Workflows

## Environment Hygiene

Run `npm run env:setup` after editing `.env.local`. Do not print secret values.

## Database Setup

Run `npm run db:migrate`, then `npm run seed`.

For the live starter baseline, run:

```bash
npm run seed:baseline -- --process
```

This queues Nate B. Jones main uploads from the four most recent completed Saturday-through-Friday weeks. The live catalog boundary is `CATALOG_START_DATE=2026-03-01`; older seeded or experimental rows should not drive the daily or weekly archive. The weekly archive is not capped at four; completed Saturday-through-Friday catalog weeks remain stored. The baseline fetches deeper than 50 uploads and excludes Shorts-style or very short clips by default.

## Ingestion

Queue ingestion from `/app/creators`, then process with `/app/settings` or `npm run ingest:process`.

Production discovery and processing are split:

- `/api/cron/check-creators` runs hourly and queues missing daily work for newly discovered or previously missed videos.
- `/api/cron/process-ingest` runs every five minutes and processes queued videos. It does not generate weekly digests inline. When `MAX_VIDEOS_PROCESSED_PER_CRON_RUN` is above one, `INGEST_PROCESS_CONCURRENCY` controls the bounded worker pool used for daily generation.
- `/api/cron/generate-weekly-digest` runs on Saturday and publishes completed Saturday-through-Friday weekly digests. `WEEKLY_DIGEST_CONCURRENCY` controls bounded parallel weekly synthesis during backfills or multi-week refreshes.
- `/app/settings` -> `Refresh and run now` runs discovery plus processing for admin/local verification.
- `POST /api/admin/run-ingest-now` with `CRON_SECRET` also runs discovery plus processing by default; pass `?discover=0` to process only.

Run `npm run daily:refresh-follow-ups` to rebuild stored daily follow-up text from the nearest prior daily digest for each creator.

Run `npm run daily:regenerate -- --date=YYYY-MM-DD` to safely regenerate stored daily digests after verifying/fetching transcript text. This command fails closed if transcript grounding checks do not pass.

Missing transcripts stay retryable: the hourly retry budget is controlled by `TRANSCRIPT_MAX_RETRY_ATTEMPTS`, then retries continue on the slower `TRANSCRIPT_EXTENDED_RETRY_SECONDS` cadence instead of permanently failing the item. Transcript fetches are bounded by `TRANSCRIPT_FETCH_TIMEOUT_MS` so a hung YouTube transcript request cannot consume the whole Vercel route budget. The scraper remains the default; if `TRANSCRIPT_API_KEY` is set, queue processing may use TranscriptAPI after the first scraper miss is older than `TRANSCRIPT_API_FALLBACK_AFTER_HOURS` hours, default `2`.

Run `npm run ingest:recover` to inspect wedged transcript rows. It defaults to a dry run and reports `waitingWithCompletedTranscript`, `terminalFailedWithCompletedTranscript`, `terminalFailedFetchableTranscript`, and `nonGroundedDailyRows`. Add `--fetch` to test terminal failed rows with a live transcript fetch during dry run, and add `--apply` only after reviewing the targeted reset set.

Run `npm run backfill:grounded -- --force` to re-discover configured creator back catalogs, queue transcript-grounded reprocessing, regenerate daily digests from verified transcript text, and refresh affected weekly digests. Add `--since=YYYY-MM-DD --until=YYYY-MM-DD` for a bounded production run, and use `--dry-run` before a large run.

Run `npm run catalog:audit -- --strict` to verify the March 1, 2026 catalog has no missing grounded daily rows or missing/weak completed weekly rows. Run `npm run weekly:recover-catalog` to regenerate missing or weak catalog weekly rows with bounded concurrency; use `--dry-run`, `--week=YYYY-MM-DD`, `--limit=N`, or `--force-weak=false` to scope the recovery.

Keep `ALLOW_WEEKLY_DIGEST_FALLBACK=false` for production/catalog recovery. If a weekly provider route exhausts, retry the targeted week rather than allowing `local:fallback` to publish.

Run `npm run weekly:refresh-research` to refresh the starter weekly archive with the curated date-scoped research notes used for the baseline "This Week in AI" editions.

## Verification

Run `npm test`, `npm run lint`, and `npm run build` before pushing.
