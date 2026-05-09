# Decisions

## 2026-05-09: Direct Postgres for App Data

The app uses the `postgres` package with `DATABASE_URL` for server-side database access. This keeps all DB reads/writes server-only and avoids exposing Supabase API keys to client components.

## 2026-05-09: Supabase Storage Only for Assets

Supabase JS is used lazily for Storage uploads when generated audio/image assets are enabled and `SUPABASE_SERVICE_ROLE_KEY` is present.

## 2026-05-09: Bounded Digest Layouts

The LLM returns JSON and a `layout_type` from a fixed enum. React chooses the layout; models never generate UI code.

## 2026-05-09: Transcript Honesty

Free YouTube transcripts are stored as `youtube_transcript_free`. Gemini fallback output is stored as `gemini_video_derived_notes`, never as an official transcript.

## 2026-05-09: Weekly Digest Archive

The first Nate B. Jones baseline starts with four weekly editions because it covers 28 days. Weekly digests are not capped at four; every completed Sunday-to-Saturday week with daily digests can be stored and shown in the archive. Future weekly editions appear after the week completes, while larger backfills can create older archived weeks.
