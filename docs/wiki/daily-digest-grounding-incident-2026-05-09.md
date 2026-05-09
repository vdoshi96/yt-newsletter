# Daily Digest Grounding Incident: 2026-05-09

## Summary

On 2026-05-09, the daily digest pipeline generated two daily digests from Gemini-derived video notes instead of verified YouTube transcript text. One stored source note explicitly said the source could not be accessed directly and that the summary was based on the video title plus general prompt-engineering knowledge. That is a trust-breaking failure mode.

Affected rows:

- `647pSnX5H_Y` / `2dc72f05-0b14-45f5-9d92-567954bba9ca`
- `cUo-QtAectY` / `d1cd459e-6f78-4616-8dd2-a8511e0d9431`

Both rows had `gemini_video_derived_notes` transcript records with `transcript_text = null`, `transcript_length = 0`, `needs_retry = true`, and completed ingest job items. Model usage showed Gemini `video_fallback_notes` calls followed by DeepSeek `daily_structured_digest` calls.

## Root Cause

The old pipeline failed open:

1. `ensureTranscript` attempted the free YouTube transcript fetch.
2. When that fetch missed, the code called Gemini with only the public YouTube URL and stored the output as `source = 'gemini_video_derived_notes'`, `status = 'completed'`.
3. `ensureDailyDigest` treated that row as usable source material by passing `transcript_text ?? JSON.stringify(derived_notes)` to the LLM.
4. The daily prompt included `VIDEO TITLE`, allowed partial/non-official source material, and said to keep the digest useful even if source material was partial.
5. The daily generation function also had a local fallback that could produce a digest when providers failed.
6. The job runner marked the item completed because no hard validation gate blocked digest generation.

## Fix

Daily digest generation now fails closed unless it has a verified transcript:

- Allowed daily transcript source is `youtube_transcript_free`.
- The transcript row must match the expected `video_id`.
- `status` must be `completed`.
- `transcript_text` must exist.
- Transcript length must meet `DAILY_DIGEST_MIN_TRANSCRIPT_CHARS`, default `1200`.
- Placeholder/unavailable transcript text is rejected.
- A transcript source timestamp must be recorded.
- Gemini-derived video notes are no longer used as daily digest source material.
- Title, description, thumbnail, channel metadata, search results, and prior knowledge are explicitly forbidden as evidence.
- The model prompt no longer includes the video title.
- The local daily digest fallback was removed.
- Provider output must include at least one source note quote that appears in the transcript.
- `what_creator_said` claims must overlap transcript vocabulary.
- The application attaches canonical `transcript_grounding` metadata after validation instead of trusting model-shaped metadata.

The digest display now follows the new structure:

- TL;DR
- Plain English Explanation
- Level 1: Beginner CS Background
- Level 2: Intermediate CS Background
- Level 3: Advanced CS / AI Systems Background
- Actionable Takeaways
- Concepts to Learn
- Transcript Grounding

## Safe Regeneration

Use:

```bash
npm run daily:regenerate -- --date=YYYY-MM-DD
```

To regenerate one known video row:

```bash
npm run daily:regenerate -- --date=YYYY-MM-DD --video-id=<video_uuid>
```

The script:

- Finds existing daily digest rows for the date.
- Fetches or reuses a verified `youtube_transcript_free` transcript.
- Runs the same transcript validation gate as normal ingestion.
- Generates a new digest from transcript text only.
- Runs post-generation grounding checks.
- Invalidates old non-transcript fallback records by marking them `failed`.
- Updates the existing `daily_digests` row only after generation and validation succeed.
- Stores transcript source, transcript length, video ID, transcript ID, transcript timestamp, generation timestamp, generation model, quote anchors, and `regenerated_after_hallucination_fix`.

For 2026-05-09, both affected rows were regenerated successfully:

- `647pSnX5H_Y`: verified transcript length `30,972`, model `deepseek:deepseek-chat`.
- `cUo-QtAectY`: verified transcript length `1,234`, model `deepseek:deepseek-chat`.

The previous `gemini_video_derived_notes` records for both videos were invalidated with `status = 'failed'`.

## Verification Query

Run a read-only check:

```sql
select
  dd.digest_date,
  v.youtube_video_id,
  t.source,
  length(coalesce(t.transcript_text, '')) as transcript_length,
  dd.full_digest_json->'transcript_grounding' as transcript_grounding,
  dd.source_notes
from daily_digests dd
join videos v on v.id = dd.video_id
join transcripts t on t.video_id = v.id
where dd.digest_date = '2026-05-09'
  and t.source = 'youtube_transcript_free'
  and t.status = 'completed';
```

Expected:

- `source = youtube_transcript_free`
- `transcript_length >= 1200`
- `transcript_grounding.transcript_source = youtube_transcript_free`
- `transcript_grounding.regenerated_after_hallucination_fix = true`
- `source_notes` include exact transcript quotes

## QA Checklist

- Run `npm test`.
- Run `npm run lint`.
- Run `npx tsc --noEmit`.
- Run the local app and open `/app/daily?date=2026-05-09`.
- Confirm the old title-only summaries are gone.
- Confirm each 2026-05-09 video has a transcript-grounding panel.
- Confirm the panel shows transcript source, transcript length, video ID, generation timestamp, model, and quote excerpts.
- Confirm the plain English explanation appears once.
- Confirm the three explanation levels are CS-background levels, not three copies of plain English.
- Confirm failed transcript extraction leaves the queue item waiting/failed instead of publishing a digest.
