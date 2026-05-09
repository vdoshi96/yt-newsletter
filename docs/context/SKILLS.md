# Project Workflows

## Environment Hygiene

Run `npm run env:setup` after editing `.env.local`. Do not print secret values.

## Database Setup

Run `npm run db:migrate`, then `npm run seed`.

For the live starter baseline, run:

```bash
npm run seed:baseline -- --process
```

This queues Nate B. Jones main uploads from the past 28 calendar days and confirms four weekly digest slots. The baseline fetches deeper than 50 uploads and excludes Shorts-style or very short clips by default.

## Ingestion

Queue ingestion from `/app/creators`, then process with `/app/settings` or `npm run ingest:process`.

## Verification

Run `npm test`, `npm run lint`, and `npm run build` before pushing.
