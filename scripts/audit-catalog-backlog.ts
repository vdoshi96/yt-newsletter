import "./load-env";
import { closeSql, getSql } from "@/lib/db";
import {
  VERIFIED_TRANSCRIPT_SOURCES,
  minimumTranscriptCharacters,
} from "@/lib/digests/grounding";
import { getCatalogFirstWeeklyStart, getCatalogStartDate } from "@/lib/catalog";
import {
  getSaturdayToFridayWeekRange,
  isWeeklyDigestReady,
  isWeeklyPodcastReady,
} from "@/lib/weekly/week-range";

const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");
const now = new Date();

async function main() {
  const sql = getSql();
  const catalogStart = getCatalogStartDate();
  const firstWeeklyStart = getCatalogFirstWeeklyStart();
  const minTranscriptCharacters = minimumTranscriptCharacters();
  const creators = await sql<Array<{ id: string; title: string | null }>>`
    select distinct creators.id::text as id, creators.title
    from creators
    left join daily_digests on daily_digests.creator_id = creators.id
    left join videos on videos.creator_id = creators.id
    where daily_digests.id is not null
      or videos.published_at::date >= ${catalogStart}::date
    order by creators.title nulls last
  `;

  let issueCount = 0;
  for (const creator of creators) {
    const missingDaily = await sql<MissingDailyRow[]>`
      select
        videos.published_at::date::text as published_date,
        videos.youtube_video_id,
        videos.title,
        daily_digests.processing_status,
        daily_digests.grounding_status,
        daily_digests.transcript_source,
        daily_digests.transcript_length
      from videos
      left join daily_digests on daily_digests.video_id = videos.id
      where videos.creator_id = ${creator.id}
        and videos.published_at::date >= ${catalogStart}::date
        and videos.published_at::date <= current_date
        and coalesce(videos.duration_seconds, 0) >= 300
        and lower(coalesce(videos.title, '')) not like '%#shorts%'
        and lower(coalesce(videos.title, '')) not like '% #short %'
        and not (
          daily_digests.grounding_status = 'grounded'
          and daily_digests.transcript_source = any(${VERIFIED_TRANSCRIPT_SOURCES}::text[])
          and coalesce(daily_digests.transcript_length, 0) >= ${minTranscriptCharacters}
        )
      order by videos.published_at asc
    `;
    const dailyDates = await sql<Array<{ digest_date: string }>>`
      select distinct daily_digests.digest_date::text as digest_date
      from daily_digests
      join videos on videos.id = daily_digests.video_id
      where daily_digests.creator_id = ${creator.id}
        and daily_digests.digest_date >= ${catalogStart}::date
        and daily_digests.grounding_status = 'grounded'
        and daily_digests.transcript_source = any(${VERIFIED_TRANSCRIPT_SOURCES}::text[])
        and coalesce(daily_digests.transcript_length, 0) >= ${minTranscriptCharacters}
        and coalesce(videos.duration_seconds, 0) >= 300
        and lower(coalesce(videos.title, '')) not like '%#shorts%'
        and lower(coalesce(videos.title, '')) not like '% #short %'
      order by digest_date asc
    `;
    const expectedWeeks = new Map<string, { weekStart: string; weekEnd: string }>();
    for (const row of dailyDates) {
      const range = getSaturdayToFridayWeekRange(row.digest_date);
      if (range.weekStart >= firstWeeklyStart && isWeeklyDigestReady(range, now)) {
        expectedWeeks.set(range.weekStart, range);
      }
    }
    const weeklyRows = await sql<WeeklyAuditRow[]>`
      select
        week_start::text,
        week_end::text,
        generation_model,
        grounding_status,
        processing_status,
        source_digest_count,
        podcast_status,
        podcast_audio_asset_id::text,
        podcast_model,
        podcast_generation_metadata->'audio_qa'->>'status' as audio_qa_status
      from weekly_digests
      where creator_id = ${creator.id}
        and week_start >= ${firstWeeklyStart}::date
      order by week_start asc
    `;
    const weeklyByStart = new Map(weeklyRows.map((row) => [row.week_start, row]));
    const missingWeekly = [...expectedWeeks.keys()].filter((weekStart) => !weeklyByStart.has(weekStart));
    const weakWeekly = weeklyRows.filter((row) =>
      expectedWeeks.has(row.week_start) &&
      (
        row.grounding_status !== "grounded" ||
        row.processing_status !== "digest_generated" ||
        !row.generation_model ||
        row.generation_model.startsWith("local:")
      ),
    );
    const missingPodcasts = weeklyRows.filter((row) =>
      expectedWeeks.has(row.week_start) &&
      isWeeklyPodcastReady({ weekStart: row.week_start, weekEnd: row.week_end }, now) &&
      (
        !row.podcast_audio_asset_id ||
        !isGeneratedPodcastStatus(row.podcast_status) ||
        row.audio_qa_status !== "passed"
      ),
    );
    issueCount += missingDaily.length + missingWeekly.length + weakWeekly.length + missingPodcasts.length;
    console.log(JSON.stringify({
      creator: creator.title ?? creator.id,
      catalogStart,
      firstWeeklyStart,
      dailyGroundedDates: dailyDates.length,
      missingDailyCount: missingDaily.length,
      missingDaily: missingDaily.slice(0, 20),
      expectedCompletedWeeks: expectedWeeks.size,
      weeklyRows: weeklyRows.length,
      missingWeekly,
      weakWeekly: weakWeekly.map(formatWeeklyRow),
      missingOrFailedPodcasts: missingPodcasts.map(formatPodcastRow),
    }, null, 2));
  }

  if (strict && issueCount > 0) {
    throw new Error(`Catalog backlog audit found ${issueCount} issue(s).`);
  }
}

function isGeneratedPodcastStatus(status: string | null) {
  return status === "generated" || status === "podcast_generated";
}

type MissingDailyRow = {
  published_date: string;
  youtube_video_id: string;
  title: string | null;
  processing_status: string | null;
  grounding_status: string | null;
  transcript_source: string | null;
  transcript_length: number | null;
};

type WeeklyAuditRow = {
  week_start: string;
  week_end: string;
  generation_model: string | null;
  grounding_status: string | null;
  processing_status: string | null;
  source_digest_count: number | null;
  podcast_status: string | null;
  podcast_audio_asset_id: string | null;
  podcast_model: string | null;
  audio_qa_status: string | null;
};

function formatWeeklyRow(row: WeeklyAuditRow) {
  return {
    week_start: row.week_start,
    generation_model: row.generation_model,
    source_digest_count: row.source_digest_count,
  };
}

function formatPodcastRow(row: WeeklyAuditRow) {
  return {
    week_start: row.week_start,
    podcast_status: row.podcast_status,
    audio_qa_status: row.audio_qa_status,
    podcast_model: row.podcast_model,
  };
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSql();
  });
