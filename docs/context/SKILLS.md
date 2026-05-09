# Project Workflows

## Environment Hygiene

Run `npm run env:setup` after editing `.env.local`. Do not print secret values.

## Database Setup

Run `npm run db:migrate`, then `npm run seed`.

For the live starter baseline, run:

```bash
npm run seed:baseline -- --process
```

This queues Nate B. Jones videos from the past 28 days and confirms four weekly digest slots.

## Ingestion

Queue ingestion from `/app/creators`, then process with `/app/settings` or `npm run ingest:process`.

## Verification

Run `npm test`, `npm run lint`, and `npm run build` before pushing.
