# Daily, Weekly, and Podcast Audit: 2026-05-16

## App Contract

The app should discover creator uploads, queue long-form main videos, fetch verified YouTube transcript text, generate daily digests only from that transcript text, store the result in `daily_digests`, synthesize completed Saturday-through-Friday weekly digests from grounded daily rows, then generate podcast scripts/audio from finalized weekly rows. UI pages read stored database rows; long-running generation should happen on the backend and save durable DB state instead of relying on a browser request to hold open.

The hard grounding rule remains: do not generate summaries, digests, or podcasts from video titles alone.

## PR Intent Review

- PR #1 intended to improve freshness: hourly discovery, processing known videos missing daily digests, manual refresh, and clearer status/log visibility.
- PR #2 intentionally removed unsafe fallback behavior by requiring verified `youtube_transcript_free` transcript text before daily digest generation.
- PR #3 focused on grounded back-catalog regeneration, idempotency, weekly/podcast safeguards, and UI filtering. It did not fully address the long 24-hour waiting-transcript retry window.

## Root Cause

Recent videos were discovered and queued, but several ingest items stayed in `waiting_for_transcript` with legacy future `retry_after` timestamps from a 24-hour transcript retry policy. Live local transcript checks proved those transcripts were already available, so the queue was not recovering quickly enough to produce daily digests. A second issue appeared during regeneration: model providers sometimes returned harmless schema variants, such as non-canonical `layout_type` values or string/object forms for fields the app expected as arrays.

## Fixes

- Changed transcript retry defaults from 24 hours to hourly via `TRANSCRIPT_RETRY_MINUTES=60`.
- Added transcript retry predicates that recover legacy future `retry_after` waits after the shorter retry window.
- Added `TRANSCRIPT_MAX_RETRY_ATTEMPTS=48`.
- Prioritized fresh videos in queue processing and limited cron processing to one video per run by default.
- Marked non-main/short videos as terminal failures so they do not monopolize the queue.
- Prevented terminal/completed waiting-transcript rows from being retried or counted as open creator work.
- Defaulted the Daily UI to the grounded final row when a date also has blocked short-form rows.
- Added item-level retry tracking for transcript-missing states.
- Normalized daily model payload variants before schema validation.
- Required full daily digest versions at beginner/intermediate/advanced CS/AI proficiency levels.
- Switched weekly generation to DeepSeek first, with a 5-minute provider timeout and a larger weekly output budget.
- Tightened weekly prompt length bounds so deep dives stay parseable.
- Moved the final podcast production to the deterministic two-host builder, with source contracts, quote anchors, uncertainty ledger, segmented Gemini TTS, retry/backoff, deterministic silence, and audio QA before publishing.

## Generation Audit

Daily digest audit for main long-form videos from 2026-05-01 through 2026-05-16:

- 16/16 main long-form daily rows are `digest_generated`.
- 16/16 are `grounded`.
- 16/16 use `youtube_transcript_free`.
- 16/16 have transcript lengths above the grounding threshold.
- 16/16 have persisted `full_level_versions.beginner`, `full_level_versions.intermediate`, and `full_level_versions.advanced`.
- 15/16 regenerated with `deepseek:deepseek-chat`; one row fell back after malformed DeepSeek JSON and stored as `qwen:qwen3-max`.
- Legacy May short-form rows are marked failed/non-main, with zero pending May daily rows remaining.

Completed May-covering weekly digest audit:

- `2026-04-25` to `2026-05-01`: `deepseek:deepseek-chat`, 7 source references, podcast word count 4,359.
- `2026-05-02` to `2026-05-08`: `deepseek:deepseek-chat`, 7 source references, podcast word count 4,591.
- `2026-05-09` to `2026-05-15`: `deepseek:deepseek-chat`, 7 source references, podcast word count 4,546.

Podcast audit:

- `2026-04-25` to `2026-05-01`: Gemini MP3 generated, 1,692.86 seconds, 154.5 WPM, audio QA passed.
- `2026-05-02` to `2026-05-08`: Gemini MP3 generated, 1,776.02 seconds, 155.1 WPM, audio QA passed.
- `2026-05-09` to `2026-05-15`: Gemini MP3 generated, 1,771.30 seconds, 154.0 WPM, audio QA passed.

2026-05-16 is a Saturday and starts the next Saturday-through-Friday weekly window, so it has a generated daily digest but is not part of a completed weekly digest until that week closes.

## Verification

Commands completed:

- `npm test`: 142 files, 409 tests passed.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- `npm run backfill:grounded -- --dry-run --since=2026-05-01 --until=2026-05-16`: 0 items would be queued.

Live database audits confirmed daily, weekly, and podcast rows as described above.

Browser verification against the local app confirmed:

- `/app/daily?date=2026-05-16` renders the stored daily digest and all three full proficiency versions.
- `/app/weekly?week=2026-05-09` renders the DeepSeek weekly digest, grounded source notes, and grounded metadata.
- `/app/podcasts?week=2026-05-09` renders the generated Gemini audio, source references, and audio QA passed status.
