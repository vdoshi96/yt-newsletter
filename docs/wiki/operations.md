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

## Daily Transcript Grounding

Daily digests must never be generated from title-only, metadata-only, stale placeholder, or model-derived video notes. The hard gate before LLM generation requires:

- a transcript row tied to the exact `video_id`;
- `source = youtube_transcript_free`;
- `status = completed`;
- non-placeholder transcript text;
- transcript length of at least `DAILY_DIGEST_MIN_TRANSCRIPT_CHARS` characters, default `1200`;
- a recorded transcript source timestamp.

If transcript extraction fails, the ingest item waits for the transcript retry window instead of publishing a digest. The daily prompt excludes the video title and forbids title, description, thumbnail, channel metadata, prior knowledge, or search results as evidence. The post-generation check requires quote anchors that appear in the transcript.

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

Weekly prompts now ask for more substantial `market_investment_lens` and `research_briefs`. The local weekly fallback also returns longer market and research text so fallback editions are useful without pretending to have external research.

## Podcast Generation

Weekly podcast scripts are generated as a long-form two-host deep dive from the stored weekly digest. The script includes intro, topic transitions, main discussion, market memo, research desk, practical takeaways, uncertainty caveat, and closing.

Configuration:

- `PODCAST_SCRIPT_TARGET_MINUTES` controls script length target. Default: `8`.
- `PODCAST_SCRIPT_WORDS_PER_MINUTE` controls word target math. Default: `145`.
- `PODCAST_GENERATION_MODE` defaults to `two_host_deep_dive`.
- `PODCAST_TTS_PROVIDER` defaults to `gemini_flash`.
- `GEMINI_TTS_MODEL` or `PODCAST_TTS_MODEL` selects the Gemini Flash TTS model.
- Gemini host casts rotate by week between Puck/Kora (`Puck` + `Kore`) and Achird/Silafat (`Achird` + `Sulafat`).
- `PODCAST_FEMALE_VOICE` / `PODCAST_MALE_VOICE` only apply to the optional Qwen voice-designed path.
- `PODCAST_AUDIO_BITRATE` controls MP3 export bitrate for `npm run podcasts:generate`. Default: `128k`.

`npm run podcasts:generate` is the preferred high-quality path because it uses Gemini Flash native multi-speaker TTS by default and stores an MP3 in Supabase. Inline weekly generation skips audio unless `PODCAST_TTS_PROVIDER=qwen_simple`, which avoids accidentally producing a single-voice default TTS file.

NotebookLM currently has no stable app API for automated generation from this app. Treat NotebookLM as a manual external production option; the automated path here is the best feasible stack-native alternative.

## Weekly Calendar and Story Links

Weekly digest and podcast pages accept `week=YYYY-MM-DD`. Any selected date is normalized to the app's Sunday-to-Saturday week start. If no week is supplied, the pages select the latest stored week and fall back to the current Sunday.

Both weekly pages include a `Jump to current` control. If no digest or podcast exists for the selected week, the page shows an empty state instead of rendering the wrong archive item.

Weekly story cards link to `/app/daily?creatorId=...&date=...` using the story date. If no daily digest exists for that date, the daily page shows its existing empty state.
