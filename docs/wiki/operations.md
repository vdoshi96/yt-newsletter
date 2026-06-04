# Digest Operations

## Cron and Ingestion Flow

Production uses four Vercel Cron entries:

- `/api/cron/check-creators` runs hourly at minute 2. It discovers recent uploads for every linked creator, upserts the latest videos, and queues any video that does not already have a daily digest or an open ingest item.
- `/api/cron/process-ingest` runs every five minutes. It fetches verified YouTube transcripts, generates the daily digest only after transcript validation passes, and writes it idempotently by `video_id`. Weekly generation is isolated to the weekly cron so daily queue processing cannot spend its budget on weekly AI calls.
- `/api/cron/generate-weekly-digest` runs on Saturday and explicitly refreshes completed Saturday-through-Friday weekly editions.
- `/api/cron/generate-weekly-podcast` runs daily and retries one ready weekly podcast with missing or failed audio. This lets provider quota failures retry after the provider limit resets.

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
- `DEEPSEEK_PROVIDER_TIMEOUT_MS` controls DeepSeek request timeout. Default: `600000` so V4 Pro can spend up to ten minutes on higher-quality daily, weekly, and podcast text output. Routes that run DeepSeek generation use longer `maxDuration` values than the provider timeout.
- `DAILY_AI_MAX_OUTPUT_TOKENS` is optional. Leave it unset so the app does not impose an extra daily output cap beyond provider/model limits.
- `WEEKLY_AI_MAX_OUTPUT_TOKENS` is optional. Leave it unset so the app does not impose an extra weekly output cap beyond provider/model limits.

Stored transcript/digest metadata includes transcript length, transcript source hash, extraction metadata, extraction timestamp, generation model, generation timestamp, grounding status, source references, and processing status. The canonical processing states are `pending`, `transcript_missing`, `transcript_ready`, `digest_generated`, `podcast_generated`, and `failed`.

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

## Podcast Generation

Weekly podcast scripts are generated as a long-form two-host deep dive from the stored weekly digest. The default script path asks DeepSeek V4 Pro for a natural Maya/Theo-style episode and falls back to the deterministic two-host builder only after the provider route is exhausted. The generated script should feel like one coherent conversation rather than three audience-level explanations stitched together.

Configuration:

- `PODCAST_SCRIPT_TARGET_MINUTES` controls script length target. Default: `30`.
- `PODCAST_SCRIPT_WORDS_PER_MINUTE` controls word target math. Default: `145`.
- `PODCAST_GENERATION_MODE` defaults to `provider_script`.
- `PODCAST_TTS_PROVIDER` defaults to `gemini_flash`.
- `GEMINI_TTS_MODEL` or `PODCAST_TTS_MODEL` selects the Gemini Flash TTS model. Default: `gemini-2.5-flash-preview-tts`.
- `GEMINI_TTS_CHUNK_MAX_CHARACTERS` controls Gemini multi-speaker TTS chunk size. Default: `4800`, which reduces quota burn while still splitting long scripts for audio consistency.
- `GEMINI_TTS_LINE_MAX_CHARACTERS` controls the maximum single host line size before sentence splitting. Default: `1800`.
- Gemini host casts rotate by week between Maya/Theo (`Puck` + `Kore`) and Nina/Jonah (`Achird` + `Sulafat`).
- `PODCAST_FEMALE_VOICE` / `PODCAST_MALE_VOICE` only apply to the optional Qwen voice-designed path.
- `PODCAST_AUDIO_BITRATE` controls MP3 export bitrate for `npm run podcasts:generate`. Default: `128k`.

`npm run podcasts:generate` is the preferred high-quality audio path because it uses Gemini Flash native multi-speaker TTS by default and stores audio in Supabase. By default it selects ready weekly podcasts inside the March 1, 2026 catalog boundary; use `--limit=N`, `--week=YYYY-MM-DD`, `--force`, or `--include-not-ready` when backfilling. Podcast metadata stores provider, model, cast/voice config, target minutes, word count, source references, audio QA, generation status, and failures internally. Listener-facing pages hide those operational details.

Production also has `/api/cron/generate-weekly-podcast`, which retries ready weekly podcast audio in small batches (`PODCASTS_PER_CRON_RUN`, default `1`) while keeping audio generation serial by default (`PODCAST_GENERATION_CONCURRENCY=1`) for TTS rate-limit safety and the 800-second Vercel function budget. The cron path uses Gemini Flash and uploads WAV audio directly so it does not depend on local `ffmpeg`; failed rows stay retryable and are picked up by the next daily run.

NotebookLM currently has no stable app API for automated generation from this app. Treat NotebookLM as a manual external production option; the automated path here is the best feasible stack-native alternative.

## Weekly Calendar and Story Links

Weekly digest and podcast pages accept `week=YYYY-MM-DD`. Any selected date is normalized to the app's Saturday-through-Friday week start. If no week is supplied, the pages select the latest stored week and fall back to the current Saturday.

The weekly digest page includes a `Jump to latest published` control. The podcast page includes a `Jump to latest available` control. If no digest or podcast exists for the selected week, the page shows an empty state instead of rendering the wrong archive item.

Weekly story cards link to `/app/daily?creatorId=...&date=...` using the story date. If no daily digest exists for that date, the daily page shows its existing empty state.

## Known Failure Modes

- Missing or short transcripts produce `transcript_missing` and no final digest.
- Transcript fetch errors are logged with `[ingest:transcript-fetch-failed]`, including video ID, reason, and retryability. Transcript-missing items keep retrying on an extended schedule after the hourly retry budget is used.
- Provider JSON/schema failures prevent daily or weekly writes until a valid grounded payload is produced.
- Weekly market context stays conservative unless date-scoped external research notes are supplied.
- Podcast audio can fail because of missing TTS credentials, provider errors, Supabase Storage errors, or local `ffmpeg` failures. The UI shows the failure state instead of treating missing audio as final content.
