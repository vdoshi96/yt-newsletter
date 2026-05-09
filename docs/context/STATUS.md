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
- One-month baseline flow for Nate B. Jones with four weekly digest slots
- Baseline video filtering that excludes Shorts-style and very short clips from the live starter data
- Daily and weekly digest explanation levels: beginner, intermediate, and advanced
- Four live two-host Qwen-generated weekly podcast MP3s attached to the starter baseline
- Prompt files and Zod validation
- Focused tests for parsing, auth, schemas, progress, and date/video selection

## Verification

Last known local checks:

- `npm test`: passing, 23 tests
- `npm run lint`: passing
- `npm run build`: passing

## Deployment Notes

- Local `DATABASE_URL` and `DIRECT_URL` authenticate after rebuilding their embedded password from `DATABASE_PASSWORD`.
- If production still shows a Postgres auth error, refresh Vercel's `DATABASE_URL` with the same URL-encoded password value used locally, then redeploy.
