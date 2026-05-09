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

Run `npm run daily:refresh-follow-ups` to rebuild stored daily follow-up text from the nearest prior daily digest for each creator.

Run `npm run weekly:refresh-research` to refresh the starter weekly archive with the curated date-scoped research notes used for the baseline "This Week in AI" editions.

## Verification

Run `npm test`, `npm run lint`, and `npm run build` before pushing.
