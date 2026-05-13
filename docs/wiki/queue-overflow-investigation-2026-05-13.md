# Queue Overflow Investigation: 2026-05-13

## Symptom

Production `ingest_job_items` shows **317 rows in `status='queued'`**, with only 212 `completed`, 6 `failed`, 7 `completed`-but-transcript-missing, 3 `waiting_for_transcript`, and 1 `processing`. The expected steady state for the single seeded creator (Nate B. Jones, past ~30 days, long-form only) is 30–50 items, not 317.

## Code-side discovery path (trace)

1. **`checkCreatorsForNewVideos()`** — [src/lib/processor.ts:486](../../src/lib/processor.ts) — iterates every creator linked via `user_creators`. For each one it calls `discoverCreatorVideos(channel_url, discoveryLimit)` with `CREATOR_DISCOVERY_LOOKBACK_LIMIT` defaulting to **10**.
2. **`discoverCreatorVideos`** — [src/lib/youtube/client.ts:79](../../src/lib/youtube/client.ts) — when `YOUTUBE_API_KEY` is set, calls `discoverWithYouTubeApi`, which fetches the channel's uploads playlist via `fetchPlaylistItems(apiKey, uploadsPlaylistId, count)`. `fetchPlaylistItems` paginates with `maxResults=min(50, count-items.length)` and stops when `items.length >= count` or no `nextPageToken` remains ([client.ts:139](../../src/lib/youtube/client.ts)). For `count=10` it returns the **10 most recent uploads (including Shorts)** of the channel's `uploads` playlist.
3. **`upsertVideos(creatorId, discovery.videos)`** — [src/lib/creators.ts:195](../../src/lib/creators.ts) — for each discovered video does `INSERT … ON CONFLICT (youtube_video_id) DO UPDATE … RETURNING id`. The unique key is `youtube_video_id`, so rediscovering the same video returns the same UUID; **no duplicate `videos` rows are produced**.
4. **`getVideoIdsNeedingIngestion(discoveredVideoIds)`** — [src/lib/processor.ts:568](../../src/lib/processor.ts) — for each candidate UUID checks `daily_digests` and any `ingest_job_items` whose status is in `('queued','processing','waiting_for_transcript','generating_digest','generating_assets')`, then defers the actual filter to `selectVideoIdsNeedingIngestion`.
5. **`selectVideoIdsNeedingIngestion`** — [src/lib/ingest/discovery.ts:15](../../src/lib/ingest/discovery.ts) — keeps any candidate where `hasDailyDigest === false && hasOpenIngestItem === false`. A video that's already queued is **skipped**, so an unprocessed queued video does not re-queue on the next hourly run.
6. **`createIngestJob`** — [src/lib/creators.ts:238](../../src/lib/creators.ts) — inserts a new `ingest_jobs` row and one `ingest_job_items` row per video, with `ON CONFLICT (job_id, video_id) DO NOTHING`. The unique constraint is `(job_id, video_id)` ([001_initial_schema.sql:111](../../supabase/migrations/001_initial_schema.sql)), **not** `(creator_id, video_id)`.

## Does hourly discovery apply any Shorts/duration filter?

**No.** [src/lib/processor.ts:500–545](../../src/lib/processor.ts) calls `discoverCreatorVideos` directly, hands the entire `discovery.videos` array to `upsertVideos`, and queues every returned UUID that lacks a daily digest or open ingest item. The `isBaselineMainVideo` helper (`duration_seconds >= 300` AND title not containing `#shorts` or ` #short ` — [src/lib/baseline/month.ts:45](../../src/lib/baseline/month.ts)) is invoked **only** in `startPastMonthBaselineForCreatorUrl` ([src/lib/creators.ts:69–70](../../src/lib/creators.ts)).

This confirms hypothesis **H5** in [cron-ingestion-investigation-2026-05-13.md](cron-ingestion-investigation-2026-05-13.md).

## Math: can 10/hour over a month explain 317 rows?

Important upload-playlist behavior: the YouTube Data API's uploads playlist returns videos **in upload order, newest first** — it does **not** scroll backward in time as new uploads arrive. So an hourly run with `count=10` typically returns the same set of recent videos, sliding only when new videos are published.

Suppose Nate publishes ~5 items/day (mix of Shorts and long uploads). In a 30-day window that's ~150 new uploads. Each hourly run pulls the latest 10. Once a new video is queued, `selectVideoIdsNeedingIngestion` excludes it on the next run (it's already an open `ingest_job_items` row). So under steady-state, hourly discovery only ever adds **new** uploads to the queue.

- **30-day pure-cron upper bound**: ~150 new uploads → ~150 queued items (assuming nothing is processed). Still well below 317.
- **Plus one-time backfill**: `npm run seed:baseline` calls `startPastMonthBaselineForCreatorUrl` with `BASELINE_MONTH_VIDEO_LOOKBACK_LIMIT=150` and applies `isBaselineMainVideo` ([src/lib/creators.ts:67–71](../../src/lib/creators.ts)), so the seeded job itself queues only ~30–50 long-form videos. That alone doesn't reach 317.
- **Reasonable real-world combination**: 30 days of hourly discovery pulling Shorts + a re-seed run, with the queue not draining (timeouts, transcript-missing on Shorts) **does** plausibly push past 200 — but to hit 317 the backfill lookback probably scooped a longer history once.

## Could repeated `npm run seed:baseline` create duplicates?

**Partially yes, but only in `ingest_jobs`/`ingest_job_items`, not in `videos`.**

- The `(job_id, video_id)` unique constraint on `ingest_job_items` ([001_initial_schema.sql:111](../../supabase/migrations/001_initial_schema.sql)) is scoped to a single job. Two different jobs each create their own rows.
- `startPastMonthBaselineForCreatorUrl` always calls `createIngestJob` regardless of whether the videos already have queued items. **It does not consult `selectVideoIdsNeedingIngestion`**, so re-running `seed:baseline` creates a fresh job containing every baseline video again, including ones still queued from the prior run.
- Net effect: each re-run can add up to ~30–50 duplicate queued items for the same video.
- However, the hourly discovery path **does** filter via `selectVideoIdsNeedingIngestion`, so it would not re-queue the same video while the prior row is still open. The duplication path is the seed script only.

A small probe (which the user should run if curious) would distinguish baseline-duplicate inflation from hourly Shorts inflation:

```sql
select video_id, count(*) as queue_rows
from ingest_job_items
where status = 'queued'
group by video_id
having count(*) > 1
order by queue_rows desc;
```

If most queued items are unique per video, this is a Shorts-inflation problem (H5). If a few videos repeat 3–5 times each, it's seed-rerun pollution.

## Final verdict

Most likely cause is a **compound**:

1. **Primary driver — hourly discovery has no Shorts filter (H5).** Nate B. Jones publishes Shorts frequently. Every hourly run can add 1–5 new Shorts items, each of which then sits in `queued` because:
   - When the processor reaches it, `fetchFreeTranscript` returns `missing` (Shorts rarely have captions), and the item flips to `waiting_for_transcript`, freeing the slot for the *next* Shorts item to be discovered, queued, and parked. The processed-but-empty side of the table (7 `completed` with "Transcript missing" message, plus 3 `waiting_for_transcript`) is consistent with this.
   - On Hobby plan timing, the 5-minute processor only drains 3 items/run; if those 3 are all Shorts, no actual long-form work moves through.
2. **Secondary driver — repeated `npm run seed:baseline` invocations** may have left a tail of duplicate `(job_id, video_id)` rows across distinct jobs, but the volume implied (a few dozen) does not by itself explain 317.
3. **Tertiary — recent `transcripts_video_source_unique` ON CONFLICT fix** ([commit 0219cc0]) means items that previously died in `failed` are now able to make progress on retry. Before that fix, items piled up but in `failed`, not `queued`; this is unlikely to explain the figure but worth ruling out by looking at `created_at` clustering.

**Implication for Part B:** filtering Shorts at the hourly-discovery boundary halts the inflation immediately. It does not clean up the historical 317 — see Part C SQL for that.
