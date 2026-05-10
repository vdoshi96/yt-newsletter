import "./load-env";
import crypto from "node:crypto";
import { generateDailyDigestPayload } from "@/lib/ai";
import { closeSql, getSql } from "@/lib/db";
import { buildDailyFollowUp, type DailyFollowUpDigest } from "@/lib/digests/follow-up";
import {
  validateTranscriptForDailyDigest,
  type DailyDigestTranscriptRecord,
} from "@/lib/digests/grounding";
import { loadPrompt } from "@/lib/prompts";
import { fetchFreeTranscript } from "@/lib/youtube/transcripts";

type DigestRow = {
  digest_id: string;
  creator_id: string;
  video_id: string;
  youtube_video_id: string;
  video_title: string;
  video_url: string;
  published_at: string | Date | null;
};

type PriorDigestRow = {
  digest_date: string;
  title: string;
  front_page_summary: string;
  why_it_matters: string;
};

const args = new Map(
  process.argv
    .slice(2)
    .map((arg) => arg.split("="))
    .filter(([key, value]) => key.startsWith("--") && value)
    .map(([key, value]) => [key.replace(/^--/, ""), value]),
);

async function main() {
  const digestDate = args.get("date");
  if (!digestDate) {
    throw new Error("Usage: npm run daily:regenerate -- --date=YYYY-MM-DD [--video-id=<uuid>]");
  }

  const sql = getSql();
  const rows = await getDigestRows(digestDate, args.get("video-id"));
  if (!rows.length) {
    throw new Error(`No daily digest rows found for ${digestDate}.`);
  }

  const prompt = await loadPrompt("daily_digest");
  let updated = 0;

  for (const row of rows) {
    console.log(`Regenerating ${row.video_title} (${row.youtube_video_id})`);
    const transcript = await ensureVerifiedTranscript(row);
    const verifiedTranscript = validateTranscriptForDailyDigest({
      expectedVideoId: row.video_id,
      transcript,
    });
    const previous = await getPreviousDailyDigests(row.creator_id, digestDate);
    const payload = await generateDailyDigestPayload({
      creatorId: row.creator_id,
      videoId: row.video_id,
      transcript: verifiedTranscript,
      prompt,
      regeneratedAfterHallucinationFix: true,
    });
    const payloadWithFollowUp = {
      ...payload,
      follow_up_from_yesterday: buildDailyFollowUp({
        current: {
          digestDate,
          title: payload.title,
          frontPageSummary: payload.front_page_summary,
          whyItMatters: payload.why_it_matters,
        },
        previous,
      }),
    };
    const grounding = payloadWithFollowUp.transcript_grounding;

    await sql.begin(async (transaction) => {
      await transaction`
        update transcripts
        set status = 'failed', needs_retry = false, retry_after = null, processing_status = 'failed', updated_at = now()
        where video_id = ${row.video_id}
          and source <> 'youtube_transcript_free'
          and status = 'completed'
      `;
      await transaction`
        update daily_digests
        set
          transcript_id = ${verifiedTranscript.id ?? null},
          transcript_source = ${grounding.transcript_source},
          transcript_length = ${grounding.transcript_length},
          grounding_status = 'grounded',
          generation_model = ${grounding.generation_model ?? null},
          generated_at = ${grounding.generation_timestamp},
          processing_status = 'digest_generated',
          source_references = ${transaction.json({
            transcriptId: verifiedTranscript.id ?? null,
            transcriptSource: grounding.transcript_source,
            transcriptLength: grounding.transcript_length,
            keyExcerpts: grounding.key_excerpts,
          })},
          layout_type = ${payloadWithFollowUp.layout_type},
          title = ${payloadWithFollowUp.title},
          dek = ${payloadWithFollowUp.dek},
          front_page_summary = ${payloadWithFollowUp.front_page_summary},
          plain_english_explanation = ${payloadWithFollowUp.plain_english_explanation},
          why_it_matters = ${payloadWithFollowUp.why_it_matters},
          what_to_do_next = ${transaction.json(payloadWithFollowUp.what_to_do_next)},
          free_learning_plan = ${transaction.json(payloadWithFollowUp.free_learning_plan)},
          glossary = ${transaction.json(payloadWithFollowUp.glossary)},
          topic_links = ${transaction.json(payloadWithFollowUp.topic_links)},
          skepticism_notes = ${payloadWithFollowUp.skepticism_notes},
          source_notes = ${transaction.json(payloadWithFollowUp.source_notes)},
          full_digest_json = ${transaction.json(toJsonParameter(payloadWithFollowUp))},
          updated_at = now()
        where id = ${row.digest_id}
      `;
    });

    updated += 1;
    console.log(
      `Stored grounded digest for ${row.youtube_video_id}: ${verifiedTranscript.transcript_character_count} transcript characters.`,
    );
  }

  console.log(`Regenerated ${updated} daily digest row(s) for ${digestDate}.`);
  await closeSql();
}

async function getDigestRows(digestDate: string, videoId?: string) {
  const sql = getSql();
  const rows = await sql<DigestRow[]>`
    select
      daily_digests.id as digest_id,
      daily_digests.creator_id,
      videos.id as video_id,
      videos.youtube_video_id,
      videos.title as video_title,
      videos.url as video_url,
      videos.published_at
    from daily_digests
    join videos on videos.id = daily_digests.video_id
    where daily_digests.digest_date = ${digestDate}
      and (${videoId ?? null}::uuid is null or videos.id = ${videoId ?? null}::uuid)
    order by videos.published_at desc nulls last
  `;
  return rows;
}

async function ensureVerifiedTranscript(row: DigestRow) {
  const sql = getSql();
  const existing = await sql<DailyDigestTranscriptRecord[]>`
    select
      id,
      video_id,
      source,
      status,
      transcript_text,
      timed_segments,
      derived_notes,
      created_at::text,
      updated_at::text
    from transcripts
    where video_id = ${row.video_id}
      and source = 'youtube_transcript_free'
      and status = 'completed'
      and transcript_text is not null
    order by created_at desc
    limit 1
  `;
  if (existing[0]) {
    const transcriptLength = existing[0].transcript_text?.trim().length ?? 0;
    const transcriptId = existing[0].id;
    if (transcriptId) {
      await sql`
        update transcripts
        set
          transcript_length = coalesce(transcript_length, ${transcriptLength}),
          source_hash = coalesce(source_hash, ${hashSourceText(existing[0].transcript_text ?? "")}),
          extraction_metadata = coalesce(
            extraction_metadata,
            ${sql.json({
              api: "youtube-transcript",
              source: existing[0].source,
              youtubeVideoId: row.youtube_video_id,
              segmentCount: existing[0].timed_segments?.length ?? 0,
              transcriptLength,
              reusedExisting: true,
              regeneration: true,
            })}
          ),
          extracted_at = coalesce(extracted_at, created_at, now()),
          processing_status = 'transcript_ready',
          updated_at = now()
        where id = ${transcriptId}
      `;
    }
    return existing[0];
  }

  const transcript = await fetchFreeTranscript(row.youtube_video_id);
  if (transcript.status !== "completed") {
    throw new Error(
      `Transcript fetch failed for ${row.youtube_video_id}; retry after ${transcript.retry_after}. Digest was not regenerated.`,
    );
  }

  const inserted = await sql<DailyDigestTranscriptRecord[]>`
    insert into transcripts (
      video_id,
      source,
      status,
      transcript_text,
      timed_segments,
      derived_notes,
      transcript_length,
      source_hash,
      extraction_metadata,
      extracted_at,
      processing_status,
      needs_retry,
      retry_after
    )
    values (
      ${row.video_id},
      ${transcript.source},
      ${transcript.status},
      ${transcript.transcript_text},
      ${sql.json(transcript.timed_segments)},
      null,
      ${transcript.transcript_text.length},
      ${hashSourceText(transcript.transcript_text)},
      ${sql.json({
        api: "youtube-transcript",
        source: transcript.source,
        youtubeVideoId: row.youtube_video_id,
        segmentCount: transcript.timed_segments.length,
        transcriptLength: transcript.transcript_text.length,
        fetchedAt: new Date().toISOString(),
        regeneration: true,
      })},
      now(),
      'transcript_ready',
      false,
      null
    )
    on conflict (video_id, source) do update set
      status = excluded.status,
      transcript_text = excluded.transcript_text,
      timed_segments = excluded.timed_segments,
      derived_notes = excluded.derived_notes,
      transcript_length = excluded.transcript_length,
      source_hash = excluded.source_hash,
      extraction_metadata = excluded.extraction_metadata,
      extracted_at = excluded.extracted_at,
      processing_status = excluded.processing_status,
      needs_retry = excluded.needs_retry,
      retry_after = excluded.retry_after,
      updated_at = now()
    returning
      id,
      video_id,
      source,
      status,
      transcript_text,
      timed_segments,
      derived_notes,
      created_at::text,
      updated_at::text
  `;
  return inserted[0];
}

async function getPreviousDailyDigests(creatorId: string, digestDate: string) {
  const sql = getSql();
  const rows = await sql<PriorDigestRow[]>`
    with latest_prior_date as (
      select max(digest_date) as digest_date
      from daily_digests
      where creator_id = ${creatorId}
        and digest_date < ${digestDate}
    )
    select
      daily_digests.digest_date::text as digest_date,
      daily_digests.title,
      daily_digests.front_page_summary,
      daily_digests.why_it_matters
    from daily_digests, latest_prior_date
    where daily_digests.creator_id = ${creatorId}
      and daily_digests.digest_date = latest_prior_date.digest_date
    order by daily_digests.created_at asc
  `;
  return rows.map((row): DailyFollowUpDigest => ({
    digestDate: row.digest_date,
    title: row.title,
    frontPageSummary: row.front_page_summary,
    whyItMatters: row.why_it_matters,
  }));
}

function toJsonParameter(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function hashSourceText(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

main()
  .catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSql();
  });
