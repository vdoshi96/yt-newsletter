# Codex Build Prompt: Daily Ingestion Reliability Consensus

Use this prompt for the next implementation pass in `/Users/vishal/Developer/Yt-newsletter`.

```text
You are Codex working in /Users/vishal/Developer/Yt-newsletter. Build the daily ingestion reliability fix implied by docs/context/meetingnotes.docx, but only implement the issues and approaches that are supported across the model reviews. Do not blindly apply every recommendation from the meeting notes; several proposals conflict.

Before editing:
- Read AGENTS.md and obey the warning that this is not the Next.js you know. If you touch route handlers, cron routes, App Router behavior, or build config, read the relevant guide in node_modules/next/dist/docs/ first.
- Read docs/context/PROJECT.md, docs/context/STATUS.md, docs/context/DECISIONS.md, docs/context/SKILLS.md, and docs/wiki/operations.md.
- Inspect git status and the current dirty diff. Some local changes may already implement part of the intended fix, but do not commit or preserve them blindly. Keep user/other-agent changes intact and work with them.
- Review the recent PR intent before coding: freshness cron/discovery, transcript grounding, and grounded/idempotent back-catalog recovery.

Hard product contract:
- Never generate daily digests, weekly digests, or podcasts from YouTube titles, descriptions, thumbnails, model memory, or prior notes alone.
- Daily digests can become final only from a verified `youtube_transcript_free` transcript tied to the exact `video_id`.
- Missing/invalid transcripts must stay blocked/retryable or failed/incomplete in a visible way; they must not produce final content.
- Weekly digests must use finalized, grounded daily rows only.
- Podcasts must use finalized, grounded weekly rows only.
- Preserve DeepSeek V4 Pro as the primary quality route unless a hard provider limitation requires fallback.

Consensus problem statement:
- Discovery is not the only failure. The shared root issue is the ingestion state machine around transcripts: rows can remain `waiting_for_transcript` or terminally `failed` even when transcripts later become available and can be fetched.
- A 48-hour/hourly transcript retry budget is too short for YouTube caption latency when treated as permanent failure.
- Available completed transcript rows can become disconnected from waiting ingest items.
- Stale `processing` rows need recovery, but recovery must not become an infinite silent loop.
- Cron/deployment health must be verified because the app depends on hourly discovery and five-minute queue processing.
- Observability is insufficient; future failures need clear logs/counts instead of silent idle queues.

Implementation requirements:

1. Fix the transcript retry/dequeue state machine in `src/lib/processor.ts` and keep the pure predicate mirror in `src/lib/ingest/retry.ts` in sync.
   - `queued` items remain eligible.
   - `failed` items are eligible only when nonterminal, below the general retry budget, and due.
   - `waiting_for_transcript` items are eligible when not completed and either:
     - a completed `youtube_transcript_free` transcript exists for the same video, regardless of `needs_retry`, or
     - the transcript retry is due by item `next_retry_at`, transcript `retry_after`, or stale transcript `updated_at` fallback.
   - Do not terminally fail a video solely because it has reached the initial 48 hourly transcript attempts. After the hourly window, schedule extended transcript retries using a documented configurable cadence.
   - Extended retries must not starve newer queued work. Ensure ordering/fairness prioritizes fresh `queued` work and due retries predictably, and add logs that reveal how many candidates exist by status.
   - Stale `processing` recovery must be bounded and observable. Do not allow a stale processing row to be reclaimed forever without incrementing/checking an attempt counter, recording the reclaim, or eventually surfacing terminal failure for non-transcript processor failures.

2. Add a timeout around free transcript fetching in `src/lib/youtube/transcripts.ts`.
   - `youtube-transcript` must not be able to hang until Vercel kills the function.
   - Add a configurable timeout such as `TRANSCRIPT_FETCH_TIMEOUT_MS` with a conservative default.
   - Log transcript fetch failures with video ID, classified reason, and whether the result is retryable.
   - Treat transient fetch failures as retryable transcript-missing states, but keep the grounding gate strict.

3. Add reconciliation/recovery for rows already wedged by the old behavior.
   - Create a dry-run-first script or command that identifies:
     - `waiting_for_transcript` ingest items with a completed transcript row.
     - terminal `failed` ingest items whose error indicates missing transcript, where a completed transcript row exists or a fresh fetch succeeds.
     - non-grounded/failed daily rows that would incorrectly suppress rediscovery.
   - Default to dry-run. Require an explicit `--apply` or equivalent before mutating DB state.
   - When applying, reset only the affected rows to a safe retryable state (`queued` or equivalent), clear stale retry timestamps as needed, and preserve/audit validation metadata.
   - Do not wholesale reset unrelated failed rows or delete user data.

4. Remove cron-budget hazards that directly interfere with daily availability.
   - Verify `/api/cron/process-ingest`, `/api/cron/check-creators`, `/api/cron/generate-weekly-digest`, and `/api/cron/generate-weekly-podcast` are present in `vercel.json`, authenticated by `CRON_SECRET`, and have route `maxDuration` values consistent with their actual work.
   - If hourly discovery or queue processing still performs weekly digest generation inline, move that work behind the dedicated weekly cron route so daily discovery/processing cannot spend its 300s budget on weekly AI calls.
   - Ensure provider timeouts cannot exceed the containing route budget unless the route explicitly supports the longer duration.

5. Preserve canonical final-state gating.
   - `getVideoIdsNeedingIngestion()` must treat a daily digest as done only when `grounding_status = 'grounded'` and `processing_status = 'digest_generated'`.
   - Failed, placeholder, legacy, or ungrounded daily rows must not suppress future discovery/retry.
   - UI/rendering behavior must continue showing blocked-vs-final states instead of rendering placeholders as final content.

6. Add focused tests before claiming completion.
   - Retry predicate tests for due waiting transcript rows, completed transcript reconciliation even when `needs_retry = false`, extended retry after the hourly budget, future `next_retry_at` not yet due, terminal completed waits not retried, and bounded stale-processing recovery.
   - Transcript fetch timeout/error classification tests.
   - Static or unit tests proving discovery skip logic only accepts grounded/generated daily rows as complete.
   - Tests or static assertions proving weekly generation is not run inline by the hourly discovery/process cron paths if you make that change.
   - Keep existing grounding, weekly, podcast, and DeepSeek tests passing.

7. Verification and evidence:
   - Run `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
   - Run the recovery script in dry-run mode and report the exact candidate counts by category.
   - Use read-only SQL before mutation to show queue status counts, transcript retry status, waiting items with completed transcripts, and stale processing rows.
   - If applying recovery, run dry-run first, then apply only targeted rows, then re-run read-only SQL.
   - If production access is available, verify Vercel cron schedule/plan support and `CRON_SECRET` parity. If not available, document the exact manual checks the user must perform.

Do not do these:
- Do not generate or backfill content from titles alone.
- Do not mark transcript-missing rows as final.
- Do not blindly commit the current dirty worktree as the fix.
- Do not implement an unbounded retry loop that can monopolize `MAX_VIDEOS_PROCESSED_PER_CRON_RUN=1`.
- Do not run destructive SQL without a dry-run report and a narrow apply path.
- Do not revert unrelated user/other-agent changes.

Done means:
- The code implements a bounded, observable transcript recovery path that preserves transcript grounding.
- Existing wedged rows have a dry-run/apply recovery path.
- Daily cron work is not blocked by weekly generation or provider timeouts longer than route budgets.
- Tests and build checks pass.
- The final response explains what changed, what was verified, what recovery counts were found, and any production dashboard checks still requiring user access.
```
