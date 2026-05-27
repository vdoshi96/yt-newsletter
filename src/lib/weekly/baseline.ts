import { generateWeeklyDigestPayload } from "@/lib/ai";
import { getPastMonthBaselineWindow, type BaselineWeekWindow } from "@/lib/baseline/month";
import { getCatalogStartDate } from "@/lib/catalog";
import { getSql } from "@/lib/db";
import { minimumTranscriptCharacters } from "@/lib/digests/grounding";
import { loadPrompt } from "@/lib/prompts";
import {
  buildWeeklySourceReferences,
  buildWeeklySourceText,
  type WeeklySourceDigest,
} from "@/lib/weekly/source-text";

export async function ensurePastMonthWeeklyDigests(input: {
  creatorId: string;
  now?: Date;
  forceRegenerate?: boolean;
  generateFromSources?: boolean;
}) {
  const baseline = getPastMonthBaselineWindow(input.now);
  const createdOrConfirmed: string[] = [];

  for (const window of baseline.windows) {
    const weeklyDigestId = await ensureBaselineWeekDigest(input.creatorId, window, {
      forceRegenerate: input.forceRegenerate ?? false,
      generateFromSources: input.generateFromSources ?? true,
    });
    createdOrConfirmed.push(weeklyDigestId);
  }

  return {
    weekCount: baseline.weekCount,
    weekDigestIds: createdOrConfirmed,
    windows: baseline.windows,
  };
}

async function ensureBaselineWeekDigest(
  creatorId: string,
  window: BaselineWeekWindow,
  options: { forceRegenerate: boolean; generateFromSources: boolean },
) {
  const sql = getSql();
  const minTranscriptCharacters = minimumTranscriptCharacters();
  const catalogStartDate = getCatalogStartDate();
  const existing = await sql<Array<{ id: string; full_digest_json: unknown }>>`
    select id, full_digest_json
    from weekly_digests
    where creator_id = ${creatorId}
      and week_start = ${window.weekStart}
    limit 1
  `;

  const sourceDigests = await sql<WeeklySourceDigest[]>`
    select
      video_id::text,
      transcript_id::text,
      transcript_source,
      transcript_length,
      title,
      front_page_summary,
      plain_english_explanation,
      full_digest_json,
      why_it_matters,
      digest_date::text as digest_date
    from daily_digests
    where creator_id = ${creatorId}
      and digest_date between ${window.weekStart} and ${window.weekEnd}
      and digest_date >= ${catalogStartDate}::date
      and grounding_status = 'grounded'
      and transcript_source = 'youtube_transcript_free'
      and coalesce(transcript_length, 0) >= ${minTranscriptCharacters}
    order by digest_date asc, created_at asc
  `;

  const existingId = existing[0]?.id;
  const isPlaceholder = Boolean(
    existing[0]?.full_digest_json &&
      typeof existing[0].full_digest_json === "object" &&
      "baseline_placeholder" in existing[0].full_digest_json,
  );

  if (
    existingId &&
    !options.forceRegenerate &&
    (!isPlaceholder || sourceDigests.length === 0 || !options.generateFromSources)
  ) {
    return existingId;
  }

  const payload = options.generateFromSources && sourceDigests.length
    ? await generateWeeklyFromDailyDigests(creatorId, window, sourceDigests)
    : createEmptyWeekPayload(window);
  const sourceReferences = buildWeeklySourceReferences(sourceDigests);
  const payloadWithReferences = {
    ...payload,
    source_references: sourceReferences,
  };
  const weeklyGrounding = "weekly_grounding" in payloadWithReferences
    ? payloadWithReferences.weekly_grounding
    : null;

  if (existingId) {
    await sql`
      update weekly_digests
      set
        week_end = ${window.weekEnd},
        source_digest_count = ${weeklyGrounding?.source_digest_count ?? sourceDigests.length},
        source_date_range = ${sql.json(toJsonParameter(weeklyGrounding?.source_date_range ?? { start: window.weekStart, end: window.weekEnd }))},
        grounding_status = ${weeklyGrounding?.grounded ? "grounded" : "pending"},
        generation_model = ${weeklyGrounding?.generation_model ?? null},
        generated_at = ${weeklyGrounding?.generated_at ?? null},
        processing_status = ${weeklyGrounding?.grounded ? "digest_generated" : "pending"},
        source_references = ${sql.json(toJsonParameter(sourceReferences))},
        title = ${payloadWithReferences.title},
        newsletter_markdown = ${payloadWithReferences.newsletter_markdown},
        ranked_topics = ${sql.json(toJsonParameter(payloadWithReferences.ranked_topics))},
        what_changed = ${payloadWithReferences.what_changed},
        what_to_do_next = ${sql.json(toJsonParameter(payloadWithReferences.what_to_do_next))},
        podcast_script = ${payloadWithReferences.podcast_script},
        full_digest_json = ${sql.json(toJsonParameter(payloadWithReferences))},
        updated_at = now()
      where id = ${existingId}
    `;
    return existingId;
  }

  const rows = await sql<{ id: string }[]>`
    insert into weekly_digests (
      creator_id,
      week_start,
      week_end,
      source_digest_count,
      source_date_range,
      grounding_status,
      generation_model,
      generated_at,
      processing_status,
      source_references,
      title,
      newsletter_markdown,
      ranked_topics,
      what_changed,
      what_to_do_next,
      podcast_script,
      full_digest_json
    )
    values (
      ${creatorId},
      ${window.weekStart},
      ${window.weekEnd},
      ${weeklyGrounding?.source_digest_count ?? sourceDigests.length},
      ${sql.json(toJsonParameter(weeklyGrounding?.source_date_range ?? { start: window.weekStart, end: window.weekEnd }))},
      ${weeklyGrounding?.grounded ? "grounded" : "pending"},
      ${weeklyGrounding?.generation_model ?? null},
      ${weeklyGrounding?.generated_at ?? null},
      ${weeklyGrounding?.grounded ? "digest_generated" : "pending"},
      ${sql.json(toJsonParameter(sourceReferences))},
      ${payloadWithReferences.title},
      ${payloadWithReferences.newsletter_markdown},
      ${sql.json(toJsonParameter(payloadWithReferences.ranked_topics))},
      ${payloadWithReferences.what_changed},
      ${sql.json(toJsonParameter(payloadWithReferences.what_to_do_next))},
      ${payloadWithReferences.podcast_script},
      ${sql.json(toJsonParameter(payloadWithReferences))}
    )
    returning id
  `;
  return rows[0].id;
}

async function generateWeeklyFromDailyDigests(
  creatorId: string,
  window: BaselineWeekWindow,
  sourceDigests: WeeklySourceDigest[],
) {
  const prompt = await loadPrompt("weekly_digest");
  const sourceText = buildWeeklySourceText(sourceDigests);

  return generateWeeklyDigestPayload({
    creatorId,
    weekStart: window.weekStart,
    weekEnd: window.weekEnd,
    sourceText,
    prompt,
    sourceDigestCount: sourceDigests.length,
  });
}

function createEmptyWeekPayload(window: BaselineWeekWindow) {
  return {
    baseline_placeholder: true,
    title: `Baseline week: ${window.weekStart} to ${window.weekEnd}`,
    newsletter_markdown:
      `# Baseline week: ${window.weekStart} to ${window.weekEnd}\n\n` +
      "No ingested videos were available for this seven-day slice yet. Once videos from this period are processed, this placeholder can be replaced with a source-backed weekly digest.",
    explanation_levels: {
      beginner:
        "There are no processed daily digests in this week yet, so there is nothing source-backed to explain.",
      intermediate:
        "This weekly slot is waiting for processed daily digests before it can summarize patterns at an intermediate level.",
      advanced:
        "No source-backed daily explanation levels are available for this week, so advanced synthesis is intentionally withheld.",
    },
    ranked_topics: [],
    executive_insights_memo:
      "No executive memo is available yet because this baseline week has no processed daily digests.",
    board_level_implications: [],
    market_investment_lens:
      "No market or investment lens is available yet because there are no source-backed daily digests for this baseline week.",
    weekly_posts: [],
    research_briefs: [],
    source_notes: [],
    what_changed:
      "No source-backed change summary is available because no daily digests exist for this week yet.",
    what_to_do_next: [
      "Process the queued one-month baseline job.",
      "Review the daily digests once videos have transcripts or clearly marked derived notes.",
    ],
    free_learning_plan: [
      "Use the daily digests from this week once available.",
      "Prefer free official docs, papers, and small projects before optional paid resources.",
    ],
    podcast_script:
      "This baseline week does not have source-backed podcast material yet because no daily digests were available.",
  };
}

function toJsonParameter(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
