# Cron Ingestion Investigation: 2026-05-13

## Status: Confirmed root cause fixed (2026-05-13)

The immediate crash (H4-adjacent) was confirmed by a live error log and fixed. The broader scheduling/timeout hypotheses (H1–H3) remain open and may still need addressing. See "Confirmed Root Cause" and "Fix Applied" sections below.

---

## Symptom

The user reports that the production cron job "isn't working and ingesting videos on its own." Manual runs work (or have worked), but the scheduled ingest does not produce new daily digests automatically.

## Background

Two Vercel Cron entries are configured in [vercel.json](../../vercel.json):

| Path | Schedule | Function | Limit |
|---|---|---|---|
| `/api/cron/check-creators` | `2 * * * *` (hourly) | `checkCreatorsForNewVideos` | discovers `CREATOR_DISCOVERY_LOOKBACK_LIMIT` (10) videos per creator |
| `/api/cron/process-ingest` | `*/5 * * * *` (every 5 min) | `processIngestQueue` | `MAX_VIDEOS_PROCESSED_PER_CRON_RUN` (3) videos per run |

Both endpoints share auth via [src/lib/api-auth.ts](../../src/lib/api-auth.ts) — `requireCronSecret` returns `false` when `CRON_SECRET` is unset and returns `401`. The README still says `check-creators` is "daily"; the actual schedule was tightened to hourly in `99779cd`. The user calling this "the daily cron" is consistent with that older labeling.

Two crons + the manual admin runner all go through the same `processor.ts` code path, so anything that breaks `processIngestQueue` or `checkCreatorsForNewVideos` will affect every path equally.

## Ranked Root Cause Hypotheses

The investigation surfaces multiple, plausibly co-occurring causes. They are ranked by likelihood given what is verifiable from the repo.

---

### H1 — Vercel Hobby plan cron-frequency cap **(high confidence)**

**Claim.** If the Vercel project is on the Hobby plan, schedules tighter than daily are not honored. `*/5 * * * *` and `2 * * * *` would be silently throttled to once per day (or rejected at deploy time on newer Vercel UI).

**Why this is the leading hypothesis.**
- No Pro/Enterprise plan is documented anywhere in [PROJECT.md](../context/PROJECT.md), [STATUS.md](../context/STATUS.md), [DECISIONS.md](../context/DECISIONS.md), or the README.
- The DECISIONS entry "2026-05-09: Freshness-Oriented Cron Split" assumes hourly + 5-minute schedules will run; nothing verifies the plan supports them.
- The original `0 10 * * *` (daily) schedule was changed to `2 * * * *` (hourly) in `99779cd`. If the project is Hobby, that change is exactly when scheduled ingestion silently stopped firing on the user's expected cadence.

**How to confirm.**
- Open the Vercel dashboard → project → Settings → Cron Jobs and check the "Next run" timestamps.
- Or `vercel cron ls` and `vercel logs --since=24h` for the cron paths.

---

### H2 — `CRON_SECRET` not set (or stale) in Vercel production env **(high confidence)**

**Claim.** [src/lib/api-auth.ts](../../src/lib/api-auth.ts):5–7 returns `false` (→ 401) the moment `process.env.CRON_SECRET` is unset. Vercel Cron only auto-injects the `Authorization: Bearer <CRON_SECRET>` header when the env var is defined on the project; without it, the header is absent and the endpoint rejects every call.

**Why this is plausible.**
- The local `.env.local` has `CRON_SECRET`, but production env vars are managed separately and the README instructs the user to set it manually (`vercel env add CRON_SECRET production`).
- If `CRON_SECRET` was rotated locally without redeploying, the value Vercel uses to sign the cron header will not match the runtime env value seen by the function — same effect.

**How to confirm.**
- Vercel logs for `/api/cron/process-ingest` will show `401 Unauthorized` for every cron invocation.
- `vercel env ls production | grep CRON_SECRET` to verify presence.

---

### H3 — Function timeout cuts processing before completion **(high confidence)**

**Claim.** No `maxDuration` is configured anywhere ([next.config.ts](../../next.config.ts) is empty; no `export const maxDuration` in any route). Default function timeout is 10 s on Hobby, 15 s on Pro. The processor does serial work that easily exceeds that:

- `processIngestQueue` processes up to **3** items serially per run.
- Each item: `fetchFreeTranscript` (variable, often 1–5 s, but `youtube-transcript` does multiple HTTP calls) + `generateDailyDigestPayload` (DeepSeek primary, Qwen fallback; LLM round-trips are typically 10–40 s) + multiple SQL writes.
- The AI fetch in [src/lib/ai/providers.ts](../../src/lib/ai/providers.ts):25 has **no `AbortController` / timeout**, so a slow upstream blocks the function until the platform kills it.

**Compounding effect with H4.** Each item is set to status `'processing'` at processor.ts:118–121 **before** the `try`. If the function is killed mid-work, the `catch`/`finally` never runs, leaving the item permanently in `'processing'`.

**How to confirm.**
- Vercel function logs show `Task timed out after X seconds` or unexpected SIGTERM.
- DB query: `select status, count(*) from ingest_job_items group by status` shows items piling up in `processing`.

---

### H4 — No recovery path for items stuck in `processing` **(high confidence, code-confirmed)**

**Claim.** The dequeue SQL in [src/lib/processor.ts](../../src/lib/processor.ts):42–52 only picks up items where:

```
status = 'queued'
OR (status = 'waiting_for_transcript' AND transcript needs_retry is due)
```

There is no clause for `status = 'processing'` with a stale `started_at`. Any item that died mid-flight (timeout, OOM, transient DB error before the `try` started or after the cancellation) is invisible to all future cron runs.

**Why this is high-confidence.** This is independently visible from the source. Combined with H3, this is the most likely "things were working then quietly stopped" mechanism: the first timeout creates a stuck item, but subsequent runs still pick up other queued work; over days/weeks, more items accumulate in `processing` and the queue stalls.

---

### H5 — Hourly discovery does not filter Shorts **(medium confidence)**

**Claim.** The baseline flow uses `isBaselineMainVideo` (duration ≥ 300 s, title not Shorts-like). The hourly cron path does **not**: [src/lib/processor.ts](../../src/lib/processor.ts):473–553 calls `discoverCreatorVideos(..., 10)`, upserts every result, and queues every video lacking a daily digest via `selectVideoIdsNeedingIngestion` ([src/lib/ingest/discovery.ts](../../src/lib/ingest/discovery.ts)). Shorts typically have no transcript → `fetchFreeTranscript` returns `missing` → item is parked in `waiting_for_transcript` for 24 h. If the creator publishes mostly Shorts, the 3-per-run window fills with Shorts, blocking visibility on the rare main upload.

**Why this is consistent with the symptom.** The queue appears to "do nothing" because every item it processes is correctly waiting on a transcript that will never arrive.

---

### H6 — `youtube-transcript` package upstream breakage **(medium confidence)**

**Claim.** `youtube-transcript ^1.3.1` ([src/lib/youtube/transcripts.ts](../../src/lib/youtube/transcripts.ts):23) scrapes YouTube's internal endpoints. The package is well-known to break whenever YouTube rotates its watch-page schema. Every error becomes a generic `missing` ([src/lib/youtube/transcripts.ts](../../src/lib/youtube/transcripts.ts):40 — bare `catch` swallows the message). All new items get parked in `waiting_for_transcript`; daily digests stop appearing even though the cron is technically running.

**How to confirm.**
- DB: `select status, count(*) from transcripts where status = 'missing' group by status`. A spike of `missing` rows with `created_at` after a specific date is the fingerprint.
- Add a temporary `console.error("[ingest:transcript-error]", error)` inside the catch in `fetchFreeTranscript` and redeploy; logs will reveal whether the underlying error is `Could not find player_response` (YouTube schema change) vs network/timeouts.

---

### H7 — Production Postgres auth still mis-encoded **(low–medium confidence)**

**Claim.** [STATUS.md](../context/STATUS.md):41–42 already calls out: *"If production still shows a Postgres auth error, refresh Vercel's DATABASE_URL with the same URL-encoded password value used locally."* If this was never fully resolved in production, every cron invocation 500s at `getSql()` before any work happens.

**How to confirm.**
- Vercel logs: look for `password authentication failed` / `28P01` errors right at the start of a cron invocation.

---

### H8 — Local `youtube-transcript` is dynamically imported but may not bundle on Vercel **(low confidence)**

`fetchFreeTranscript` uses `await import("youtube-transcript")`. Dynamic import generally works on Vercel Node runtime, but if the package has CJS/ESM quirks the bundler can ship a stub. Worth a glance at Vercel build logs, but lower priority than H1–H7.

---

## Cross-Cutting Observation: No Signal in the Status Surface

Even if the cron were healthy, the user cannot easily tell from the UI:

- There is no admin panel that shows "last cron run, last item processed, count of items stuck in `processing`."
- All the helpful `[ingest:*]` logs go to Vercel function logs, which require checking the platform.
- `ingest_jobs.last_checked_at`/`creators.last_checked_at` exist but no UI surfaces them.

This is why a silent failure has been able to persist.

---

## Recommended Diagnostic Order (cheap → expensive)

1. **Check Vercel plan and cron dashboard.** Confirms or kills H1. ~30 seconds.
2. **`vercel env ls production`** — confirm `CRON_SECRET`, `DATABASE_URL`, `YOUTUBE_API_KEY`, `DEEPSEEK_API_KEY` are present and current. Kills H2 and H7.
3. **Vercel function logs for `/api/cron/process-ingest` over the last 24 h.** Look for 401, 500, timeout, or absent invocations. Distinguishes H1 (no invocations) from H2 (401) from H3/H7 (timeout/500) from H6 (200 with `transcript-missing-recorded` everywhere).
4. **DB query** (read-only):
   ```sql
   select status, count(*) from ingest_job_items group by status;
   select max(created_at), min(created_at) from ingest_job_items where status = 'processing';
   select status, count(*) from transcripts group by status;
   select max(last_checked_at) from creators;
   ```
   Distinguishes stuck-`processing` (H3+H4) vs starvation (H1/H2/H7) vs transcript drought (H5/H6).
5. **Hit the manual runner** via `curl -X POST .../api/admin/run-ingest-now -H "Authorization: Bearer $CRON_SECRET"` from a workstation. If it succeeds, the runtime is healthy and only the *scheduled* invocation is broken (→ H1/H2). If it fails the same way, the bug is in the code path.

## Fix Options (evaluated, not yet implemented)

Each option below addresses one or more hypotheses. They are roughly independent and most are cheap.

### F1 — Configure `maxDuration` on cron routes
Add `export const maxDuration = 60;` (or platform max) to both cron route files and the admin runner. Addresses H3 directly.

**Trade-off.** On Hobby plan, max is 60 s; Pro allows up to 300 s. Even 60 s only buys 1–2 videos per run safely. The right pairing is F1 + F2.

### F2 — Recover stuck-`processing` items in the dequeue query
Extend [src/lib/processor.ts](../../src/lib/processor.ts):42–52 to also pick up items where `status = 'processing' AND started_at < now() - interval '15 minutes'`. Addresses H4.

**Trade-off.** Risks double-processing if an old run somehow finishes after the recovery window. Mitigated because `daily_digests.video_id` is unique and the `INSERT … ON CONFLICT` is idempotent. The transcript insert is *not* deduped per video_id; consider adding `ON CONFLICT (video_id, source)` after migration.

### F3 — Drop the per-run video limit, or process one item at a time
Switch `MAX_VIDEOS_PROCESSED_PER_CRON_RUN` to `1`, and rely on the 5-minute cron frequency to drain the queue. Addresses H3 without changing the timeout.

**Trade-off.** Lower throughput, but more predictable; one timeout no longer poisons two follow-up items.

### F4 — Filter Shorts in hourly discovery too
Apply `isBaselineMainVideo` inside `checkCreatorsForNewVideos` before `upsertVideos`. Addresses H5.

**Trade-off.** Loses the ability to ingest the rare worthwhile short-form video. Acceptable for the product (PROJECT.md is about long-form learning digests).

### F5 — Surface transcript-fetch errors instead of swallowing
Log the actual error in [src/lib/youtube/transcripts.ts](../../src/lib/youtube/transcripts.ts):40. Addresses H6 by making the failure mode visible.

**Trade-off.** None; pure observability win.

### F6 — Pin or replace `youtube-transcript`
Audit upstream changelog; consider a maintained fork or `youtube-transcript-api` alternatives. Addresses H6 if confirmed.

**Trade-off.** Larger change; do only if H6 is confirmed by F5's new logs.

### F7 — Add cron healthcheck surface
Add `/api/admin/ingest-health` (JSON) returning `last_cron_run_at`, count by status, oldest `processing` item, `last_checked_at` per creator. Optionally surface in `/app/settings`. Doesn't fix anything, but turns "silent failure" into "obvious failure" next time. Recommended regardless of which fix lands.

### F8 — Move long work off the cron path
For real safety, push transcript fetch + LLM generation into a background queue (e.g., Vercel Queues, Inngest, Supabase pg_cron) and keep the HTTP cron endpoint as a thin trigger. Bigger lift; reserve for if F1–F3 prove insufficient.

### F9 — Audit Vercel plan and cron behavior
If H1 is confirmed, options are: upgrade to Pro, or move the schedule to once-per-day and accept slower freshness. The DECISIONS doc would need an amendment either way.

## Suggested Minimal Fix Set

If diagnostics confirm H1 is *not* the cause (i.e. the project is Pro or the schedules truly run):

1. **F1** (maxDuration) + **F2** (stuck-`processing` recovery) + **F3** (limit = 1) — three small edits, all defensive, no new dependencies. This unblocks the most common failure mode.
2. **F5** (log transcript errors) — one-line observability change to identify H6 vs H5 going forward.
3. **F7** (health endpoint) — prevents the next silent regression.

If H1 *is* the cause, F1–F3 don't help until the plan/schedule issue is resolved.

## Confirmed Root Cause (2026-05-13)

Live error log received:

```
[ingest:item-failed] {
  message: 'duplicate key value violates unique constraint "transcripts_video_source_unique"'
}
```

**What happened:**
1. A first cron run failed (timeout or transient error) after inserting a `missing` transcript row for `(video_id, 'youtube_transcript_free')`.
2. The ingest item was set to `waiting_for_transcript`.
3. On retry, `ensureTranscript` correctly skipped the existing-completed check, fetched the transcript (this time successfully), then tried to INSERT a second row for the same `(video_id, source)` pair.
4. The unique constraint `transcripts_video_source_unique` — which exists in production but was **never added to the schema migration** — rejected the insert.
5. The `catch` block in `processQueueItem` marked the item `failed`. Permanently stuck.

**Why the constraint was not in the migration:** It was added directly to the production database at some point (possibly during initial setup or debugging) without a corresponding migration file. The code assumed no uniqueness constraint existed, so both INSERT statements were written without `ON CONFLICT`.

## Fix Applied (2026-05-13)

- **`src/lib/processor.ts`:** Both `INSERT INTO transcripts` statements in `ensureTranscript` now include `ON CONFLICT (video_id, source) DO UPDATE SET ...`.
  - Completed-transcript insert: updates `status`, `transcript_text`, `timed_segments`, `needs_retry = false`, `retry_after = null`.
  - Missing-transcript insert: updates `status = 'missing'`, `needs_retry = true`, refreshes `retry_after`.
- **`supabase/migrations/002_transcripts_unique_source.sql`:** New idempotent migration that adds the constraint on fresh deployments (safe no-op if it already exists).
- TypeScript: clean. Tests: 124/124 passing.

**Items already in `failed` state** due to this bug will not self-heal. Run:
```sql
-- Reset failed items caused by the duplicate-key bug so they are requeued
update ingest_job_items
set status = 'queued', error_message = null, started_at = null, completed_at = null, updated_at = now()
where status = 'failed'
  and error_message like '%transcripts_video_source_unique%';
```
Then trigger a manual ingest run or wait for the next cron cycle.

## Retry Mechanism (2026-05-13)

H4 (no recovery path for stuck/failed items) is now fixed. The dequeue and error handling in `src/lib/processor.ts` recognize three retry-eligible states:

1. `status = 'failed'` with `retry_count < INGEST_ITEM_MAX_RETRIES` and `next_retry_at <= now()` — covers generic provider/timeout errors and grounding failures (`creator claim is not supported by transcript vocabulary` and similar). These were previously terminal.
2. `status = 'processing'` with `started_at < now() - INGEST_ITEM_RETRY_DELAY_SECONDS` and `retry_count < INGEST_ITEM_MAX_RETRIES` — auto-unsticks items that died mid-flight (timeout, crash before the `catch`).
3. `status = 'waiting_for_transcript'` continues to use the existing `transcripts.needs_retry` + `transcripts.retry_after` path (unchanged).

When `processQueueItem` catches an error, it reads the current `retry_count`. If `retry_count + 1 < INGEST_ITEM_MAX_RETRIES` it schedules a retry (`status = 'failed'`, `completed_at = null`, `next_retry_at = now() + delay`, increments `retry_count`); otherwise it writes `completed_at = now()` to mark the item terminally failed. The two cases emit `[ingest:item-retry-scheduled]` and `[ingest:item-retry-exhausted]` log lines respectively.

When a recovered item is picked up, the existing "set to processing" UPDATE clears `next_retry_at` and resets `started_at = now()` so the stuck-`processing` window starts fresh for the new attempt.

`syncJobCounts` was adjusted so the parent `ingest_jobs.status` no longer flips to `'completed'` while child items have pending retries scheduled (a `failed` item with `completed_at IS NULL` is treated as in-flight rather than terminal). `ingest_jobs.failed_count` now reflects only terminally-failed items.

### Configuration

| Env var | Default | Meaning |
|---|---|---|
| `INGEST_ITEM_MAX_RETRIES` | `5` | Maximum number of attempts before an item becomes terminally failed. |
| `INGEST_ITEM_RETRY_DELAY_SECONDS` | `3600` | Delay between attempts. Also doubles as the stuck-`processing` window. |

### Schema additions

`supabase/migrations/003_ingest_item_retry.sql` adds (idempotently) to `ingest_job_items`:

- `retry_count integer not null default 0`
- `next_retry_at timestamptz` (nullable)

`supabase/migrations/001_initial_schema.sql` was updated to include the columns in the `create table` block for fresh deploys.

### Files

- `src/lib/processor.ts` — dequeue SQL, retry scheduling in catch, `syncJobCounts` semantics
- `src/lib/ingest/retry.ts` — pure `shouldRetryItem` helper mirroring the SQL predicate
- `tests/ingest-retry.test.ts` — covers the predicate's branches

## Open Questions

- Which Vercel plan is the project on?
- When did the user last see a fresh daily digest produced without manual intervention? That date pinpoints which commit/state caused the regression.
- Are the local `.env.local` `CRON_SECRET` and the Vercel production `CRON_SECRET` byte-identical?

## Files Touched in Investigation (read-only)

- [vercel.json](../../vercel.json)
- [src/app/api/cron/process-ingest/route.ts](../../src/app/api/cron/process-ingest/route.ts)
- [src/app/api/cron/check-creators/route.ts](../../src/app/api/cron/check-creators/route.ts)
- [src/app/api/admin/run-ingest-now/route.ts](../../src/app/api/admin/run-ingest-now/route.ts)
- [src/lib/api-auth.ts](../../src/lib/api-auth.ts)
- [src/lib/processor.ts](../../src/lib/processor.ts)
- [src/lib/ingest/discovery.ts](../../src/lib/ingest/discovery.ts)
- [src/lib/youtube/transcripts.ts](../../src/lib/youtube/transcripts.ts)
- [src/lib/youtube/client.ts](../../src/lib/youtube/client.ts)
- [src/lib/ai/providers.ts](../../src/lib/ai/providers.ts)
- [src/lib/digests/grounding.ts](../../src/lib/digests/grounding.ts)
- [src/lib/config.ts](../../src/lib/config.ts)
- [supabase/migrations/001_initial_schema.sql](../../supabase/migrations/001_initial_schema.sql)
- [docs/wiki/operations.md](operations.md)
- [docs/context/STATUS.md](../context/STATUS.md)

No code changes were made in this investigation.
