import { generateWeeklyDigestPayload } from "@/lib/ai";
import { getCatalogStartDate } from "@/lib/catalog";
import { numberEnv } from "@/lib/config";
import { normalizeConcurrency, runBoundedConcurrency } from "@/lib/concurrency";
import { getSql } from "@/lib/db";
import {
  VERIFIED_TRANSCRIPT_SOURCES,
  minimumTranscriptCharacters,
} from "@/lib/digests/grounding";
import { loadPrompt } from "@/lib/prompts";
import {
  getSaturdayToFridayWeekRange,
  isWeeklyDigestReady,
  type WeeklyRange,
} from "@/lib/weekly/week-range";
import {
  buildWeeklySourceReferences,
  buildWeeklySourceText,
  type WeeklySourceDigest,
} from "@/lib/weekly/source-text";

export async function ensureWeeklyDigestForVideoWeek(input: {
  creatorId: string;
  publishedAt: string | Date | null;
  now?: Date;
}) {
  if (!input.publishedAt) return null;
  const range = getSaturdayToFridayWeekRange(input.publishedAt);
  if (!isWeeklyDigestReady(range, input.now)) return null;

  return ensureWeeklyDigestForRange({
    creatorId: input.creatorId,
    range,
  });
}

export async function ensureCompletedWeeklyDigestsForCreator(input: {
  creatorId: string;
  now?: Date;
  forceRegenerate?: boolean;
}) {
  const sql = getSql();
  const minTranscriptCharacters = minimumTranscriptCharacters();
  const catalogStartDate = getCatalogStartDate();
  const rows = await sql<Array<{ digest_date: string }>>`
    select distinct digest_date::text as digest_date
    from daily_digests
    join videos on videos.id = daily_digests.video_id
    where daily_digests.creator_id = ${input.creatorId}
      and daily_digests.grounding_status = 'grounded'
      and daily_digests.digest_date >= ${catalogStartDate}::date
      and daily_digests.transcript_source = any(${VERIFIED_TRANSCRIPT_SOURCES}::text[])
      and coalesce(daily_digests.transcript_length, 0) >= ${minTranscriptCharacters}
      and coalesce(videos.duration_seconds, 0) >= 300
      and lower(coalesce(videos.title, '')) not like '%#shorts%'
      and lower(coalesce(videos.title, '')) not like '% #short %'
    order by daily_digests.digest_date asc
  `;

  const rangesByStart = new Map<string, WeeklyRange>();
  for (const row of rows) {
    const range = getSaturdayToFridayWeekRange(row.digest_date);
    if (isWeeklyDigestReady(range, input.now)) {
      rangesByStart.set(range.weekStart, range);
    }
  }

  const weekDigestIds: string[] = [];
  const ranges = [...rangesByStart.values()];
  const concurrency = getWeeklyDigestConcurrency(ranges.length);
  const generatedIds = await runBoundedConcurrency(ranges, concurrency, async (range) => {
    const id = await ensureWeeklyDigestForRange({
      creatorId: input.creatorId,
      range,
      forceRegenerate: input.forceRegenerate,
    });
    return id;
  });
  for (const id of generatedIds) {
    if (id) weekDigestIds.push(id);
  }

  return { weekCount: weekDigestIds.length, weekDigestIds };
}

function getWeeklyDigestConcurrency(itemCount: number) {
  return Math.min(
    normalizeConcurrency(numberEnv("WEEKLY_DIGEST_CONCURRENCY", 2)),
    Math.max(1, itemCount),
  );
}

export async function ensureWeeklyDigestForRange(input: {
  creatorId: string;
  range: WeeklyRange;
  forceRegenerate?: boolean;
}) {
  const sql = getSql();
  const { weekStart, weekEnd } = input.range;
  const minTranscriptCharacters = minimumTranscriptCharacters();
  const catalogStartDate = getCatalogStartDate();
  const existing = await sql<{ id: string }[]>`
    select id
    from weekly_digests
    where creator_id = ${input.creatorId}
      and week_start = ${weekStart}
    limit 1
  `;
  if (existing[0] && !input.forceRegenerate) return existing[0].id;

  const daily = await sql<WeeklySourceDigest[]>`
    select
      daily_digests.video_id::text,
      daily_digests.transcript_id::text,
      daily_digests.transcript_source,
      daily_digests.transcript_length,
      daily_digests.title,
      daily_digests.front_page_summary,
      daily_digests.plain_english_explanation,
      daily_digests.full_digest_json,
      daily_digests.why_it_matters,
      daily_digests.digest_date::text
    from daily_digests
    join videos on videos.id = daily_digests.video_id
    where daily_digests.creator_id = ${input.creatorId}
      and daily_digests.digest_date between ${weekStart} and ${weekEnd}
      and daily_digests.digest_date >= ${catalogStartDate}::date
      and daily_digests.grounding_status = 'grounded'
      and daily_digests.transcript_source = any(${VERIFIED_TRANSCRIPT_SOURCES}::text[])
      and coalesce(daily_digests.transcript_length, 0) >= ${minTranscriptCharacters}
      and coalesce(videos.duration_seconds, 0) >= 300
      and lower(coalesce(videos.title, '')) not like '%#shorts%'
      and lower(coalesce(videos.title, '')) not like '% #short %'
    order by daily_digests.digest_date asc, daily_digests.created_at asc
  `;
  if (!daily.length) return existing[0]?.id ?? null;

  const prompt = await loadPrompt("weekly_digest");
  const sourceText = buildWeeklySourceText(daily);
  const sourceReferences = buildWeeklySourceReferences(daily);
  const generatedPayload = await generateWeeklyDigestPayload({
    creatorId: input.creatorId,
    weekStart,
    weekEnd,
    sourceText,
    prompt,
    sourceDigestCount: daily.length,
  });
  const payload = {
    ...generatedPayload,
    source_references: sourceReferences,
  };
  const weeklyGrounding = payload.weekly_grounding;

  if (existing[0]) {
    await sql`
      update weekly_digests
      set
        week_end = ${weekEnd},
        source_digest_count = ${weeklyGrounding.source_digest_count},
        source_date_range = ${sql.json(toJsonParameter(weeklyGrounding.source_date_range ?? { start: weekStart, end: weekEnd }))},
        grounding_status = ${weeklyGrounding.grounded ? "grounded" : "pending"},
        generation_model = ${weeklyGrounding.generation_model ?? null},
        generated_at = ${weeklyGrounding.generated_at ?? null},
        processing_status = 'digest_generated',
        source_references = ${sql.json(toJsonParameter(sourceReferences))},
        title = ${payload.title},
        newsletter_markdown = ${payload.newsletter_markdown},
        ranked_topics = ${sql.json(toJsonParameter(payload.ranked_topics))},
        what_changed = ${payload.what_changed},
        what_to_do_next = ${sql.json(toJsonParameter(payload.what_to_do_next))},
        full_digest_json = ${sql.json(toJsonParameter(payload))},
        updated_at = now()
      where id = ${existing[0].id}
    `;
    return existing[0].id;
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
      full_digest_json
    )
    values (
      ${input.creatorId},
      ${weekStart},
      ${weekEnd},
      ${weeklyGrounding.source_digest_count},
      ${sql.json(toJsonParameter(weeklyGrounding.source_date_range ?? { start: weekStart, end: weekEnd }))},
      ${weeklyGrounding.grounded ? "grounded" : "pending"},
      ${weeklyGrounding.generation_model ?? null},
      ${weeklyGrounding.generated_at ?? null},
      'digest_generated',
      ${sql.json(toJsonParameter(sourceReferences))},
      ${payload.title},
      ${payload.newsletter_markdown},
      ${sql.json(toJsonParameter(payload.ranked_topics))},
      ${payload.what_changed},
      ${sql.json(toJsonParameter(payload.what_to_do_next))},
      ${sql.json(toJsonParameter(payload))}
    )
    on conflict (creator_id, week_start) do nothing
    returning id
  `;
  return rows[0]?.id ?? null;
}

function toJsonParameter(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
