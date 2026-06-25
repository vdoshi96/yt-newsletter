# Decisions

## 2026-05-09: Direct Postgres for App Data

The app uses the `postgres` package with `DATABASE_URL` for server-side database access. This keeps all DB reads/writes server-only and avoids exposing Supabase API keys to client components.

## 2026-05-09: Supabase Storage Retired

The original MVP used Supabase Storage for generated media assets. The weekly podcast feature was retired on 2026-06-07, and the active app no longer uploads generated audio assets.

## 2026-05-09: Bounded Digest Layouts

The LLM returns JSON and a `layout_type` from a fixed enum. React chooses the layout; models never generate UI code.

## 2026-05-09: Transcript-Grounded Daily Digests

Free YouTube transcripts are stored as `youtube_transcript_free`. If the scraper path keeps failing after the configured waiting window, TranscriptAPI rows are stored as `transcriptapi_com` and are also treated as verified transcript text. Daily digests may only be generated from verified transcript text tied to the exact `video_id`; model-derived notes, title-only metadata, descriptions, thumbnails, and prior knowledge are forbidden as source evidence. Missing or invalid transcripts keep ingestion waiting/failed instead of publishing a digest. Regeneration uses `npm run daily:regenerate -- --date=YYYY-MM-DD`, which invalidates old non-transcript fallback records after a replacement digest passes transcript grounding checks.

## 2026-05-09: Weekly Digest Archive

The live Nate B. Jones catalog starts on March 1, 2026 (`CATALOG_START_DATE`). Daily views, weekly generation, and weekly archive selection should ignore older seeded or experimental rows. Weekly digests are not capped; every completed Saturday-to-Friday week with catalog daily digests can be stored and shown in the archive. Future weekly editions appear Saturday morning after the Friday close.

## 2026-05-09: Freshness-Oriented Cron Split

Creator discovery runs hourly and queue processing runs every five minutes. Discovery is idempotent and queues videos that lack a daily digest and lack an open ingest item, even if the video row already exists. Daily digest writes are keyed by `video_id`, so overlapping or recovered jobs do not create duplicate digests.

## 2026-06-24: Temporary Production Job Pause

Automatic production jobs can be paused without deleting the project by deploying
`vercel.json` with an empty `crons` array. The cron route handlers, database
data, manual scripts, and restart schedule remain in the repo so the pipeline can
be resumed by restoring the three Vercel Cron entries and redeploying.

## 2026-06-07: Weekly Podcast Retirement

The automated weekly podcast path is retired. Weekly digest generation no longer creates podcast scripts, the podcast page is removed from navigation, and Vercel no longer schedules podcast audio retries. Historical database columns may remain for compatibility with existing data, but active code should not add new weekly podcast assets.

## 2026-05-09: Weekly Calendar Navigation

Weekly digest pages use a `week=YYYY-MM-DD` query parameter that normalizes any selected date to the app's Saturday-to-Friday week. Weekly story cards link to the corresponding daily digest date and rely on the daily empty state when no daily digest exists.

## 2026-05-09: Grounded Back-Catalog Regeneration

Back-catalog regeneration is driven by `npm run backfill:grounded`. The command re-discovers configured creator catalogs, queues videos that are missing grounded daily digests, optionally force-regenerates trusted rows, and refreshes weekly digests after daily processing. It stores queryable transcript, digest, and weekly metadata while preserving the hard rule that missing transcripts block final content instead of falling back to titles.

## 2026-05-16: DeepSeek V4 Pro Editorial Path

Daily and weekly digests use `deepseek-v4-pro` as the primary high-quality route. The DeepSeek request path explicitly enables thinking mode, omits temperature for thinking requests, allows a longer DeepSeek timeout, does not impose an app-level daily/weekly output cap unless explicitly configured, retries the primary route before fallback, and logs provider/model/attempt metadata. Dashboard daily counts are scoped to grounded long-form digests from the latest 30 days instead of historical rows.

Weekly catalog generation fails closed by default if the provider route is exhausted (`ALLOW_WEEKLY_DIGEST_FALLBACK=false`) and gives DeepSeek five attempts before fallback providers. This prevents deterministic `local:fallback` weekly rows from silently satisfying backlog recovery.

## 2026-05-16: Weekly Publication Navigation

Weekly digest generation has an explicit Saturday cron route at `/api/cron/generate-weekly-digest`. The weekly page jumps to the latest stored published Saturday-through-Friday edition rather than the current in-progress week, so the Saturday publication for the prior completed week remains visible.

## 2026-05-26: Transcript Recovery and Daily Cron Isolation

Daily discovery and queue-processing cron routes must not generate weekly digests inline. Transcript fetches are bounded by `TRANSCRIPT_FETCH_TIMEOUT_MS`, transcript-missing rows move from hourly retries to extended retries instead of becoming final content, stale processing rows are reclaimed only within the retry budget, and `npm run ingest:recover` is the dry-run-first path for rows wedged by earlier transcript retry behavior. The scraper remains the default transcript provider; TranscriptAPI is only attempted when `TRANSCRIPT_API_KEY` is present and the first `youtube_transcript_free` miss is older than `TRANSCRIPT_API_FALLBACK_AFTER_HOURS` (default `2`).
