# Digest Operations

## Cron and Ingestion Flow

Production uses two Vercel Cron entries:

- `/api/cron/check-creators` runs hourly at minute 2. It discovers recent uploads for every linked creator, upserts the latest videos, and queues any video that does not already have a daily digest or an open ingest item.
- `/api/cron/process-ingest` runs every five minutes. It fetches verified YouTube transcripts, generates the daily digest only after transcript validation passes, writes it idempotently by `video_id`, and then checks whether completed weekly digests are now available.

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
- `source = youtube_transcript_free`;
- `status = completed`;
- non-placeholder transcript text;
- transcript length of at least `DAILY_DIGEST_MIN_TRANSCRIPT_CHARS` characters, default `1200`;
- a recorded transcript source timestamp.

If transcript extraction fails, the ingest item waits for the transcript retry window instead of publishing a digest. The daily prompt excludes the video title and forbids title, description, thumbnail, channel metadata, prior knowledge, or search results as evidence. The post-generation check requires quote anchors that appear in the transcript.

Transcript retry configuration:

- `TRANSCRIPT_RETRY_MINUTES` controls how soon a missing transcript is retried. Default: `60`.
- `TRANSCRIPT_MAX_RETRY_ATTEMPTS` controls how many transcript-missing attempts are allowed before the item becomes terminally failed. Default: `48`.
- `MAX_VIDEOS_PROCESSED_PER_CRON_RUN` should stay at `1` for cron reliability; provider fallback can take long enough that multi-item HTTP runs risk hitting the route `maxDuration`.
- `AI_PROVIDER_TIMEOUT_MS` controls provider request timeout. Default: `300000` so DeepSeek can spend up to five minutes on higher-quality daily and weekly text output.
- `WEEKLY_AI_MAX_OUTPUT_TOKENS` controls the weekly model output budget. Default: `12000` so source-backed deep dives are less likely to truncate into invalid JSON.

Stored transcript/digest metadata includes transcript length, transcript source hash, extraction metadata, extraction timestamp, generation model, generation timestamp, grounding status, source references, and processing status. The canonical processing states are `pending`, `transcript_missing`, `transcript_ready`, `digest_generated`, `podcast_generated`, and `failed`.

To safely regenerate a date after a grounding issue:

```bash
npm run daily:regenerate -- --date=YYYY-MM-DD
```

See [Daily Digest Grounding Incident: 2026-05-09](daily-digest-grounding-incident-2026-05-09.md) for the full incident write-up and QA checklist.

## Digest Prompt Behavior

Daily and weekly prompts require visibly different explanation depths. Daily digests also keep the shared Plain English Explanation separate from the three CS-background levels:

- Level 1: Beginner CS Background, for readers with basic coding knowledge.
- Level 2: Intermediate CS Background, for readers comfortable with APIs, backend systems, databases, queues, embeddings, evals, and LLM basics.
- Level 3: Advanced CS / AI Systems Background, for readers comfortable with agentic systems, inference pipelines, retrieval, model routing, observability, and production ML/LLM failure modes.

The skepticism section must not use the phrase "AI-derived notes from YouTube transcripts." Stored digests are also cleaned at parse time so older rows do not keep showing that wording.

Weekly digests use Saturday-through-Friday windows, so the edition that appears Saturday morning covers the previous weekend plus Monday through Friday. Weekly prompts synthesize daily digests instead of concatenating them, include transcript quote anchors in the weekly source text, and ask DeepSeek first for major themes, recurring concepts, practical takeaways, unresolved questions, adjacent source-bounded topic deep dives, `market_investment_lens`, and `research_briefs`. The local weekly fallback remains conservative and does not pretend to have external research.

## Podcast Generation

Weekly podcast scripts are generated as a long-form two-host deep dive from the stored weekly digest. The deterministic builder is the canonical production path, so the weekly model does not need to return the final script. The generated script includes a human-stakes cold open, source contract, three audience-depth explanations, source-backed topic arcs, market/operator lens, research desk, practical takeaways, an uncertainty ledger, and closing.

Configuration:

- `PODCAST_SCRIPT_TARGET_MINUTES` controls script length target. Default: `30`.
- `PODCAST_SCRIPT_WORDS_PER_MINUTE` controls word target math. Default: `145`.
- `PODCAST_GENERATION_MODE` defaults to `two_host_deep_dive`.
- `PODCAST_TTS_PROVIDER` defaults to `gemini_flash`.
- `GEMINI_TTS_MODEL` or `PODCAST_TTS_MODEL` selects the Gemini Flash TTS model.
- Gemini host casts rotate by week between Puck/Kora (`Puck` + `Kore`) and Achird/Silafat (`Achird` + `Sulafat`).
- `PODCAST_FEMALE_VOICE` / `PODCAST_MALE_VOICE` only apply to the optional Qwen voice-designed path.
- `PODCAST_AUDIO_BITRATE` controls MP3 export bitrate for `npm run podcasts:generate`. Default: `128k`.

`npm run podcasts:generate` is the preferred high-quality path because it uses Gemini Flash native multi-speaker TTS by default and stores an MP3 in Supabase. By default it selects up to four Sunday-ready weekly podcasts; use `--limit=N`, `--week=YYYY-MM-DD`, `--force`, or `--include-not-ready` when backfilling. Podcast metadata stores provider, model, cast/voice config, target minutes, word count, source references, audio QA, generation status, and failures. Audio QA probes the MP3 duration, codec, file size, pacing, and rejects obviously truncated or malformed audio before publishing a public asset URL.

NotebookLM currently has no stable app API for automated generation from this app. Treat NotebookLM as a manual external production option; the automated path here is the best feasible stack-native alternative.

## Weekly Calendar and Story Links

Weekly digest and podcast pages accept `week=YYYY-MM-DD`. Any selected date is normalized to the app's Saturday-through-Friday week start. If no week is supplied, the pages select the latest stored week and fall back to the current Saturday.

Both weekly pages include a `Jump to current` control. If no digest or podcast exists for the selected week, the page shows an empty state instead of rendering the wrong archive item.

Weekly story cards link to `/app/daily?creatorId=...&date=...` using the story date. If no daily digest exists for that date, the daily page shows its existing empty state.

## Known Failure Modes

- Missing or short transcripts produce `transcript_missing` and no final digest.
- Provider JSON/schema failures prevent daily or weekly writes until a valid grounded payload is produced.
- Weekly market context stays conservative unless date-scoped external research notes are supplied.
- Podcast audio can fail because of missing TTS credentials, provider errors, Supabase Storage errors, or local `ffmpeg` failures. The UI shows the failure state instead of treating missing audio as final content.
