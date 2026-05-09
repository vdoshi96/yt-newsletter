# Project Workflows

## Environment Hygiene

Run `npm run env:setup` after editing `.env.local`. Do not print secret values.

## Database Setup

Run `npm run db:migrate`, then `npm run seed`.

## Ingestion

Queue ingestion from `/app/creators`, then process with `/app/settings` or `npm run ingest:process`.

## Verification

Run `npm test`, `npm run lint`, and `npm run build` before pushing.
