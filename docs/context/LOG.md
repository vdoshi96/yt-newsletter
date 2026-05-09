# Log

## 2026-05-09

Initial local build session. Created the Next.js app, schema, auth, ingestion processor, UI pages, prompts, setup scripts, tests, and documentation. Migration and seed were blocked by invalid database credentials in `.env.local`.

## 2026-05-09 Baseline Update

Added a one-month baseline flow: the creator form now defaults to “Past month,” settings has a “Seed past month baseline” action for Nate B. Jones, `npm run seed:baseline -- --process` can populate the baseline, and weekly/podcast pages show the latest four weekly slots.
