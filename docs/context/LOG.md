# Log

## 2026-05-09

Initial local build session. Created the Next.js app, schema, auth, ingestion processor, UI pages, prompts, setup scripts, tests, and documentation. Migration and seed were blocked by invalid database credentials in `.env.local`.

## 2026-05-09 Baseline Update

Added a one-month baseline flow: the creator form now defaults to “Past month,” settings has a “Seed past month baseline” action for Nate B. Jones, `npm run seed:baseline -- --process` can populate the baseline, and weekly/podcast pages show the latest four weekly slots.

## 2026-05-09 Baseline Methodology Fix

Confirmed the initial 50-video baseline count was wrong because it counted all uploads, including Shorts and short clips. Updated baseline discovery to fetch deeper, filter to main videos by duration/title, merge the placeholder creator into the resolved YouTube channel, and regenerate live starter data as 24 main daily digests plus four weekly digests.
