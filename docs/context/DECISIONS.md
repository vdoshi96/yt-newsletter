# Decisions

## 2026-05-09: Direct Postgres for App Data

The app uses the `postgres` package with `DATABASE_URL` for server-side database access. This keeps all DB reads/writes server-only and avoids exposing Supabase API keys to client components.

## 2026-05-09: Supabase Storage Only for Assets

Supabase JS is used lazily for Storage uploads when generated audio/image assets are enabled and `SUPABASE_SERVICE_ROLE_KEY` is present.

## 2026-05-09: Bounded Digest Layouts

The LLM returns JSON and a `layout_type` from a fixed enum. React chooses the layout; models never generate UI code.

## 2026-05-09: Transcript-Grounded Daily Digests

Free YouTube transcripts are stored as `youtube_transcript_free`. Daily digests may only be generated from verified transcript text tied to the exact `video_id`; model-derived notes, title-only metadata, descriptions, thumbnails, and prior knowledge are forbidden as source evidence. Missing or invalid transcripts keep ingestion waiting/failed instead of publishing a digest. Regeneration uses `npm run daily:regenerate -- --date=YYYY-MM-DD`, which invalidates old non-transcript fallback records after a replacement digest passes transcript grounding checks.

## 2026-05-09: Weekly Digest Archive

The first Nate B. Jones baseline starts with four weekly editions because it covers 28 days. Weekly digests are not capped at four; every completed Sunday-to-Saturday week with daily digests can be stored and shown in the archive. Future weekly editions appear after the week completes, while larger backfills can create older archived weeks.

## 2026-05-09: Freshness-Oriented Cron Split

Creator discovery runs hourly and queue processing runs every five minutes. Discovery is idempotent and queues videos that lack a daily digest and lack an open ingest item, even if the video row already exists. Daily digest writes are keyed by `video_id`, so overlapping or recovered jobs do not create duplicate digests.

## 2026-05-09: Podcast Quality Path

The automated high-quality podcast path is `npm run podcasts:generate`, using a long-form two-host script and Gemini Flash native multi-speaker TTS by default. Host casts rotate weekly between Puck/Kora and Achird/Silafat. The older Qwen voice-designed segmented path remains available as an explicit provider. Inline weekly generation does not create default single-voice audio unless `PODCAST_TTS_PROVIDER=qwen_simple` is explicitly selected. NotebookLM is documented as manual because it does not expose a stable app API for this workflow.

## 2026-05-09: Weekly Calendar Navigation

Weekly digest and podcast pages use a `week=YYYY-MM-DD` query parameter that normalizes any selected date to the app's Sunday-to-Saturday week. Weekly story cards link to the corresponding daily digest date and rely on the daily empty state when no daily digest exists.
