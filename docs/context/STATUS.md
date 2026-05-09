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
- One-month baseline flow for Nate B. Jones that starts with four weekly editions
- Weekly digest archive behavior for all completed Sunday-to-Saturday weeks
- Baseline video filtering that excludes Shorts-style and very short clips from the live starter data
- Daily and weekly digest explanation levels: beginner, intermediate, and advanced
- Hourly creator discovery plus five-minute queue processing for fresher daily digests
- Admin/manual refresh that discovers YouTube uploads and processes the queue
- Long-form two-host weekly podcast scripts with configurable target length and TTS settings
- Two-host Qwen-generated weekly podcast MP3s for stored weekly digests
- Weekly digest and podcast calendar navigation
- Prompt files and Zod validation
- Focused tests for parsing, auth, schemas, progress, and date/video selection

## Verification

Last known local checks:

- `npm test`: passing, 35 tests
- `npm run lint`: passing after current branch changes
- `npm run build`: passing after current branch changes

## Deployment Notes

- Local `DATABASE_URL` and `DIRECT_URL` authenticate after rebuilding their embedded password from `DATABASE_PASSWORD`.
- If production still shows a Postgres auth error, refresh Vercel's `DATABASE_URL` with the same URL-encoded password value used locally, then redeploy.
