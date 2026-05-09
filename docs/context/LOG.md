# Log

## 2026-05-09

Initial local build session. Created the Next.js app, schema, auth, ingestion processor, UI pages, prompts, setup scripts, tests, and documentation. Migration and seed were blocked by invalid database credentials in `.env.local`.

## 2026-05-09 Baseline Update

Added a one-month baseline flow: the creator form now defaults to “Past month,” settings has a “Seed past month baseline” action for Nate B. Jones, and `npm run seed:baseline -- --process` can populate the baseline.

## 2026-05-09 Baseline Methodology Fix

Confirmed the initial 50-video baseline count was wrong because it counted all uploads, including Shorts and short clips. Updated baseline discovery to fetch deeper, filter to main videos by duration/title, merge the placeholder creator into the resolved YouTube channel, and regenerate live starter data as 24 main daily digests plus four weekly digests.

## 2026-05-09 Logout Navigation Fix

Confirmed protected tabs appeared to kick users out because the app shell rendered logout as a Next `<Link>` to a destructive GET route. Browser/router prefetch could call `/logout`, delete the session, and make the next tab click redirect to login. Logout now uses an explicit server action form, and GET `/logout` only redirects to login without deleting the session.

## 2026-05-09 Explanation Levels

Added beginner, intermediate, and advanced explanation levels to daily and weekly digest JSON contracts. Daily and weekly pages now show a Level dropdown, and weekly synthesis source text carries all three daily explanation levels forward so weekly digests can summarize at each reader level.

## 2026-05-09 Two-Host Qwen Podcasts

Added `npm run podcasts:generate` to create two-host weekly podcast MP3s with Qwen voice design/TTS, using generic British-accented female and American-accented male host descriptions instead of cloning or imitating real people. Generated and attached four live podcast audio assets for the Nate B. Jones baseline weeks.

## 2026-05-09 Weekly Archive Rework

Reworked weekly digests from a latest-four recap into a stored "This Week in AI" archive. The first backfill still starts with four weekly editions because it covers the past 28 days, but future completed Sunday-to-Saturday weeks and larger backfills remain stored. Weekly payloads now include an executive insights memo, board-level implications, market/investment lens, about 10 weekly posts, deep research briefs, source notes, and beginner/intermediate/advanced explanations.
