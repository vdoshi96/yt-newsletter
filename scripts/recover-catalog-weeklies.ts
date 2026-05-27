import "./load-env";
import { closeSql, getSql } from "@/lib/db";
import { getCatalogFirstWeeklyStart, getCatalogStartDate } from "@/lib/catalog";
import { minimumTranscriptCharacters } from "@/lib/digests/grounding";
import { normalizeConcurrency, runBoundedConcurrency } from "@/lib/concurrency";
import { numberEnv } from "@/lib/config";
import { ensureWeeklyDigestForRange } from "@/lib/weekly/generate";
import {
  getSaturdayToFridayWeekRange,
  isWeeklyDigestReady,
  type WeeklyRange,
} from "@/lib/weekly/week-range";

const args = new Map(
  process.argv
    .slice(2)
    .map((arg) => {
      const [key, ...rest] = arg.split("=");
      return [key, rest.join("=") || "true"] as const;
    })
    .filter(([key]) => key.startsWith("--"))
    .map(([key, value]) => [key.replace(/^--/, ""), value]),
);

async function main() {
  const sql = getSql();
  const catalogStart = getCatalogStartDate();
  const firstWeeklyStart = getCatalogFirstWeeklyStart();
  const minTranscriptCharacters = minimumTranscriptCharacters();
  const dryRun = args.has("dry-run");
  const forceWeak = args.get("force-weak") !== "false";
  const weekFilter = args.get("week");
  const limit = numericArg("limit", Number.POSITIVE_INFINITY);
  const creators = await sql<Array<{ id: string; title: string | null }>>`
    select distinct creators.id::text as id, creators.title
    from creators
    join daily_digests on daily_digests.creator_id = creators.id
    order by creators.title nulls last
  `;
  const targets: RecoveryTarget[] = [];

  for (const creator of creators) {
    const dailyDates = await sql<Array<{ digest_date: string }>>`
      select distinct daily_digests.digest_date::text as digest_date
      from daily_digests
      join videos on videos.id = daily_digests.video_id
      where daily_digests.creator_id = ${creator.id}
        and daily_digests.digest_date >= ${catalogStart}::date
        and daily_digests.grounding_status = 'grounded'
        and daily_digests.transcript_source = 'youtube_transcript_free'
        and coalesce(daily_digests.transcript_length, 0) >= ${minTranscriptCharacters}
        and coalesce(videos.duration_seconds, 0) >= 300
        and lower(coalesce(videos.title, '')) not like '%#shorts%'
        and lower(coalesce(videos.title, '')) not like '% #short %'
      order by digest_date asc
    `;
    const ranges = new Map<string, WeeklyRange>();
    for (const row of dailyDates) {
      const range = getSaturdayToFridayWeekRange(row.digest_date);
      if (
        range.weekStart >= firstWeeklyStart &&
        isWeeklyDigestReady(range) &&
        (!weekFilter || range.weekStart === weekFilter)
      ) {
        ranges.set(range.weekStart, range);
      }
    }
    if (!ranges.size) continue;

    const weeklyRows = await sql<WeeklyRecoveryRow[]>`
      select
        id::text,
        week_start::text,
        grounding_status,
        processing_status,
        generation_model
      from weekly_digests
      where creator_id = ${creator.id}
        and week_start >= ${firstWeeklyStart}::date
        and (${weekFilter ?? null}::date is null or week_start = ${weekFilter ?? null}::date)
    `;
    const weeklyByStart = new Map(weeklyRows.map((row) => [row.week_start, row]));
    for (const range of ranges.values()) {
      const existing = weeklyByStart.get(range.weekStart);
      const weak = existing && (
        existing.grounding_status !== "grounded" ||
        existing.processing_status !== "digest_generated" ||
        !existing.generation_model ||
        existing.generation_model.startsWith("local:")
      );
      if (!existing || (forceWeak && weak)) {
        targets.push({
          creatorId: creator.id,
          creatorTitle: creator.title ?? creator.id,
          range,
          forceRegenerate: Boolean(existing),
          reason: existing ? "weak_existing" : "missing",
        });
      }
    }
  }

  const selectedTargets = targets.slice(0, limit);
  console.log(JSON.stringify({
    catalogStart,
    firstWeeklyStart,
    dryRun,
    targetCount: selectedTargets.length,
    targets: selectedTargets.map((target) => ({
      creator: target.creatorTitle,
      weekStart: target.range.weekStart,
      weekEnd: target.range.weekEnd,
      reason: target.reason,
      forceRegenerate: target.forceRegenerate,
    })),
  }, null, 2));
  if (dryRun || selectedTargets.length === 0) return;

  const concurrency = Math.min(
    normalizeConcurrency(numberEnv("WEEKLY_DIGEST_CONCURRENCY", 2)),
    selectedTargets.length,
  );
  const results = await runBoundedConcurrency(selectedTargets, concurrency, async (target) => {
    const id = await ensureWeeklyDigestForRange({
      creatorId: target.creatorId,
      range: target.range,
      forceRegenerate: target.forceRegenerate,
    });
    return {
      creator: target.creatorTitle,
      weekStart: target.range.weekStart,
      weeklyDigestId: id,
      reason: target.reason,
    };
  });
  console.log(JSON.stringify({ generated: results, concurrency }, null, 2));
}

type WeeklyRecoveryRow = {
  id: string;
  week_start: string;
  grounding_status: string | null;
  processing_status: string | null;
  generation_model: string | null;
};

type RecoveryTarget = {
  creatorId: string;
  creatorTitle: string;
  range: WeeklyRange;
  forceRegenerate: boolean;
  reason: "missing" | "weak_existing";
};

function numericArg(name: string, fallback: number) {
  const value = Number(args.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSql();
  });
