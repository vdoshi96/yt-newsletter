# Grounded Back Catalog Regeneration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regenerate the YouTube back catalog from verified transcript/source content only, with daily and weekly digests, podcast scripts/audio metadata, scheduling safeguards, UI visibility, tests, and operator documentation.

**Architecture:** Keep the current fail-closed daily transcript gate as the trust boundary. Add canonical status metadata and a backfill command that reuses the existing ingestion/digest/podcast modules idempotently instead of introducing a parallel content pipeline. Update weekly windows to Saturday-through-Friday so Saturday digests cover the prior weekend plus Monday-Friday, and add Sunday readiness for weekly podcasts.

**Tech Stack:** Next.js App Router 16.2, TypeScript, Vitest, Supabase Postgres via `postgres`, server-only AI/TTS calls, Vercel Cron.

---

### Task 1: Status, Grounding, and Schedule Tests

**Files:**
- Modify: `tests/weekly-week-range.test.ts`
- Modify: `tests/weekly-navigation.test.ts`
- Modify: `tests/podcast-config.test.ts`
- Create: `tests/backfill-safeguards.test.ts`

- [ ] Write failing tests for Saturday-through-Friday weekly ranges and Saturday readiness.
- [ ] Write failing tests for Sunday podcast readiness.
- [ ] Write failing tests for backfill idempotency and title-only rejection helpers.
- [ ] Write failing tests proving the podcast config defaults to the new Gemini voice path and a 30-minute script target.

### Task 2: Core Scheduling and Status Helpers

**Files:**
- Modify: `src/lib/weekly/week-range.ts`
- Modify: `src/lib/weekly/navigation.ts`
- Create: `src/lib/ingest/status.ts`
- Create: `src/lib/backfill/safeguards.ts`

- [ ] Implement Saturday-through-Friday range helpers while preserving compatibility aliases where existing imports expect them.
- [ ] Add `isWeeklyPodcastReady` for Sunday weekly podcast generation.
- [ ] Add canonical processing statuses: `pending`, `transcript_missing`, `transcript_ready`, `digest_generated`, `podcast_generated`, `failed`.
- [ ] Add pure backfill selection helpers that skip grounded existing rows unless force regeneration is requested.

### Task 3: Database Metadata and Daily Regeneration

**Files:**
- Modify: `supabase/migrations/001_initial_schema.sql`
- Modify: `scripts/apply-migration.ts`
- Modify: `src/lib/processor.ts`
- Modify: `scripts/regenerate-daily-digest.ts`

- [ ] Add idempotent metadata/status columns for transcript extraction, digest generation, weekly grounding, podcast generation, and asset generation.
- [ ] Store transcript source hash, extraction metadata, extraction timestamp, and canonical processing status.
- [ ] Export reusable transcript and daily digest helpers from the processor.
- [ ] Add validation logs for transcript length, source availability, and grounding status.
- [ ] Allow explicit force regeneration of trusted daily digests while preserving fail-closed transcript validation.

### Task 4: Backfill Command

**Files:**
- Create: `scripts/backfill-grounded-catalog.ts`
- Modify: `package.json`
- Modify: `src/lib/config.ts`

- [ ] Add `npm run backfill:grounded`.
- [ ] Discover the configured back catalog for linked creators.
- [ ] Re-fetch/verify transcripts and regenerate daily digests only when transcript validation passes.
- [ ] Force-regenerate completed weekly digests after daily regeneration.
- [ ] Provide dry-run and limit controls.
- [ ] Avoid duplicate daily, weekly, and job entries on rerun.

### Task 5: Weekly Digest and Podcast Metadata

**Files:**
- Modify: `src/lib/digests/schemas.ts`
- Modify: `src/lib/weekly/generate.ts`
- Modify: `src/lib/podcasts/config.ts`
- Modify: `src/lib/podcasts/two-host.ts`
- Modify: `scripts/generate-weekly-podcasts.ts`

- [ ] Add weekly grounding and podcast generation metadata to stored JSON.
- [ ] Generate longer two-host scripts that target roughly 30 minutes using only stored weekly/daily source material.
- [ ] Store podcast script status, audio status, provider, model, cast/voice config, word count, target minutes, and source references.
- [ ] Keep audio generation idempotent and mark failures without showing placeholder audio as final content.

### Task 6: UI, Docs, and Verification

**Files:**
- Modify: `src/components/digest-renderer.tsx`
- Modify: `src/app/app/weekly/page.tsx`
- Modify: `src/app/app/podcasts/page.tsx`
- Modify: `src/app/app/jobs/page.tsx`
- Modify: `src/app/app/page.tsx`
- Modify: `docs/wiki/operations.md`
- Modify: `docs/context/SKILLS.md`
- Modify: `docs/context/DECISIONS.md`
- Modify: `docs/context/STATUS.md`

- [ ] Show generated date, source date range, model used, grounding status, and failure/audio status labels.
- [ ] Remove Sunday-to-Saturday wording and replace it with Saturday-through-Friday behavior.
- [ ] Document ingestion, daily digest, weekly digest, podcast flow, safeguards, backfill command usage, and known failure modes.
- [ ] Run `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` before completion.
