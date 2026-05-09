# Project Workflows

## Environment Hygiene

Run `npm run env:setup` after editing `.env.local`. Do not print secret values.

## Database Setup

Run `npm run db:migrate`, then `npm run seed`.

For the live starter baseline, run:

```bash
npm run seed:baseline -- --process
```

This queues Nate B. Jones main uploads from the past 28 calendar days and confirms the first four weekly editions. The weekly archive is not capped at four; completed Sunday-to-Saturday weeks remain stored. The baseline fetches deeper than 50 uploads and excludes Shorts-style or very short clips by default.

## Ingestion

Queue ingestion from `/app/creators`, then process with `/app/settings` or `npm run ingest:process`.

Production discovery and processing are split:

- `/api/cron/check-creators` runs hourly and queues missing daily work for newly discovered or previously missed videos.
- `/api/cron/process-ingest` runs every five minutes and processes queued videos.
- `/app/settings` -> `Refresh and run now` runs discovery plus processing for admin/local verification.
- `POST /api/admin/run-ingest-now` with `CRON_SECRET` also runs discovery plus processing by default; pass `?discover=0` to process only.

Run `npm run daily:refresh-follow-ups` to rebuild stored daily follow-up text from the nearest prior daily digest for each creator.

Run `npm run daily:regenerate -- --date=YYYY-MM-DD` to safely regenerate stored daily digests after verifying/fetching transcript text. This command fails closed if transcript grounding checks do not pass.

Run `npm run weekly:refresh-research` to refresh the starter weekly archive with the curated date-scoped research notes used for the baseline "This Week in AI" editions.

Run `npm run podcasts:generate` to regenerate stored weekly podcast MP3s with the rotating two-host Gemini Flash path.

## Verification

Run `npm test`, `npm run lint`, and `npm run build` before pushing.
