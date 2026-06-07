# Digest Operations

## Cron and Ingestion Flow

Production uses three Vercel Cron entries:

- `/api/cron/check-creators` runs hourly at minute 2. It discovers recent uploads for every linked creator, upserts the latest videos, and queues any video that does not already have a daily digest or an open ingest item.
- `/api/cron/process-ingest` runs every five minutes. It fetches verified YouTube transcripts, generates the daily digest only after transcript validation passes, and writes it idempotently by `video_id`. Weekly generation is isolated to the weekly cron so daily queue processing cannot spend its budget on weekly AI calls.
- `/api/cron/generate-weekly-digest` runs on Saturday and explicitly refreshes completed Saturday-through-Friday weekly editions.

This means a newly published YouTube video should be discovered within about one hour and processed on the next five-minute queue run. If the hourly discovery cron is missed, the next hourly run recovers because discovery also checks already-known videos that are missing daily digests.

Manual verification paths:

- In the app, go to `/app/settings` and use `Refresh and run now`. This checks YouTube, queues missing work, and processes the queue without exposing `CRON_SECRET`.
- For API/local testing, `POST /api/admin/run-ingest-now` with `CRON_SECRET` runs discovery plus processing by default. Add `?discover=0` to process only already-queued work.
- For CLI queue processing only, use `npm run ingest:process`.

Logs are emitted around creator discovery, transcript fetch, summarization, database writes, and UI availability. Search platform logs for the `[ingest:*]` prefix.

Back-catalog regeneration uses:

```bash
npm run backfill:grounded -- --force
```

Useful flags:

- `--dry-run`: discover and report what would be queued without writing jobs.
- `--limit=N`: discovery lookback per creator; default `BACKFILL_VIDEO_LOOKBACK_LIMIT=500`.
- `--since=YYYY-MM-DD` and `--until=YYYY-MM-DD`: limit processing and weekly refreshes to a published-at date window.
- `BACKFILL_MIN_VIDEO_DURATION_SECONDS`: ignores Shorts/short clips before queueing; default `300`.
- `--process-limit=N`: queue items to process per loop; default `BACKFILL_PROCESS_LIMIT=25`.
- `--creator-id=<uuid>`: limit the run to one configured creator.
- `--queue-only`: queue selected videos without draining the processor.

The command skips already grounded daily digests unless `--force` is passed. It does not use titles as a fallback: videos without verified transcript text stay incomplete or waiting for transcript retry.

## Daily Transcript Grounding

Daily digests must never be generated from title-only, metadata-only, stale placeholder, or model-derived video notes. The hard gate before LLM generation requires:

- a transcript row tied to the exact `video_id`;
- `source = youtube_transcript_free` or `source = transcriptapi_com`;
- `status = completed`;
- non-placeholder transcript text;
- transcript length of at least `DAILY_DIGEST_MIN_TRANSCRIPT_CHARS` characters, default `1200`;
- a recorded transcript source timestamp.

If transcript extraction fails, the ingest item waits for the transcript retry window instead of publishing a digest. The daily prompt excludes the video title and forbids title, description, thumbnail, channel metadata, prior knowledge, or search results as evidence. The post-generation check requires quote anchors that appear in the transcript.

Transcript retry configuration:

- `TRANSCRIPT_RETRY_MINUTES` controls how soon a missing transcript is retried. Default: `60`.
- `TRANSCRIPT_MAX_RETRY_ATTEMPTS` controls how many hourly transcript-missing attempts run before the item switches to extended retries. Default: `48`.
- `TRANSCRIPT_EXTENDED_RETRY_SECONDS` controls the slower retry cadence after that hourly budget is used. Default: `86400` (one day). Missing transcripts stay blocked and retryable instead of becoming terminally failed.
- `TRANSCRIPT_FETCH_TIMEOUT_MS` bounds each transcript fetch. Default: `45000`.
- `TRANSCRIPT_API_KEY` enables the managed TranscriptAPI fallback. The scraper still runs first.
- `TRANSCRIPT_API_FALLBACK_AFTER_HOURS` controls how old the first scraper miss must be before queue processing tries TranscriptAPI. Default: `2`.
- `MAX_VIDEOS_PROCESSED_PER_CRON_RUN` defaults to `4`; `INGEST_PROCESS_CONCURRENCY` defaults to `2` so recovery can drain more than one daily digest per cron run without launching an unbounded provider fan-out.
- `AI_PROVIDER_TIMEOUT_MS` controls provider request timeout for non-DeepSeek routes. Default: `300000`.
- `DEEPSEEK_PROVIDER_TIMEOUT_MS` controls DeepSeek request timeout. Default: `600000` so V4 Pro can spend up to ten minutes on higher-quality daily and weekly text output. Routes that run DeepSeek generation use longer `maxDuration` values than the provider timeout.
- `DAILY_AI_MAX_OUTPUT_TOKENS` is optional. Leave it unset so the app does not impose an extra daily output cap beyond provider/model limits.
- `WEEKLY_AI_MAX_OUTPUT_TOKENS` is optional. Leave it unset so the app does not impose an extra weekly output cap beyond provider/model limits.

Stored transcript/digest metadata includes transcript length, transcript source hash, extraction metadata, extraction timestamp, generation model, generation timestamp, grounding status, source references, and processing status. The canonical processing states are `pending`, `transcript_missing`, `transcript_ready`, `digest_generated`, and `failed`.

To inspect and recover rows wedged by old transcript behavior:

```bash
npm run ingest:recover
npm run ingest:recover -- --fetch
npm run ingest:recover -- --apply
```

The command is dry-run first. It reports waiting items with completed transcript rows, terminal transcript failures with completed transcript rows, terminal transcript failures that are fetchable now, and non-grounded daily rows that should not suppress rediscovery.

To safely regenerate a date after a grounding issue:

```bash
npm run daily:regenerate -- --date=YYYY-MM-DD
```

See [Daily Digest Grounding Incident: 2026-05-09](daily-digest-grounding-incident-2026-05-09.md) for the full incident write-up and QA checklist.

## Digest Prompt Behavior

Daily and weekly prompts require visibly different explanation depths. Daily digests keep the shared Plain English Explanation separate from the full proficiency versions:

- Beginner, for curious readers who need plain-language foundations.
- Practitioner, for readers comfortable with products, workflows, APIs, costs, evals, and LLM basics.
- Advanced, for readers comfortable with agentic systems, inference pipelines, retrieval, model routing, observability, and production ML/LLM failure modes.

The skepticism section must not use the phrase "AI-derived notes from YouTube transcripts." Stored digests are also cleaned at parse time so older rows do not keep showing that wording.

Weekly digests use Saturday-through-Friday windows, so the edition that appears Saturday morning covers the previous weekend plus Monday through Friday. Weekly prompts synthesize daily digests instead of concatenating them, include transcript quote anchors in the weekly source text, and ask DeepSeek first for major themes, recurring concepts, practical takeaways, unresolved questions, adjacent source-bounded topic deep dives, `market_investment_lens`, and `research_briefs`. The local weekly fallback remains conservative and does not pretend to have external research.

## Weekly Calendar and Story Links

Weekly digest pages accept `week=YYYY-MM-DD`. Any selected date is normalized to the app's Saturday-through-Friday week start. If no week is supplied, the page selects the latest stored week and falls back to the current Saturday.

The weekly digest page includes a `Jump to latest published` control. If no digest exists for the selected week, the page shows an empty state instead of rendering the wrong archive item.

Left and right arrow keys move the daily view by one day and the weekly view by one Saturday-through-Friday week when focus is not inside a form control.

Weekly story cards link to `/app/daily?creatorId=...&date=...` using the story date. If no daily digest exists for that date, the daily page shows its existing empty state.

## Known Failure Modes

- Missing or short transcripts produce `transcript_missing` and no final digest.
- Transcript fetch errors are logged with `[ingest:transcript-fetch-failed]`, including video ID, reason, and retryability. Transcript-missing items keep retrying on an extended schedule after the hourly retry budget is used.
- Provider JSON/schema failures prevent daily or weekly writes until a valid grounded payload is produced.
- Weekly market context stays conservative unless date-scoped external research notes are supplied.
