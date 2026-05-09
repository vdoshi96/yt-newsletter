import "./load-env";
import { closeSql, getSql } from "@/lib/db";
import { dailyDigestSchema } from "@/lib/digests/schemas";
import { buildDailyFollowUp, type DailyFollowUpDigest } from "@/lib/digests/follow-up";

type DailyRow = {
  id: string;
  creator_id: string;
  digest_date: string;
  title: string;
  front_page_summary: string;
  why_it_matters: string;
  full_digest_json: unknown;
};

async function main() {
  const sql = getSql();
  try {
    const rows = await sql<DailyRow[]>`
      select
        id,
        creator_id,
        digest_date::text as digest_date,
        title,
        front_page_summary,
        why_it_matters,
        full_digest_json
      from daily_digests
      order by creator_id asc, digest_date asc, created_at asc
    `;

    const byCreator = new Map<string, DailyRow[]>();
    for (const row of rows) {
      byCreator.set(row.creator_id, [...(byCreator.get(row.creator_id) ?? []), row]);
    }

    let updated = 0;
    for (const creatorRows of byCreator.values()) {
      const byDate = groupByDate(creatorRows);
      const sortedDates = [...byDate.keys()].sort();
      for (let index = 0; index < sortedDates.length; index += 1) {
        const digestDate = sortedDates[index];
        const currentRows = byDate.get(digestDate) ?? [];
        const priorRows = index > 0 ? byDate.get(sortedDates[index - 1]) ?? [] : [];
        const previous = priorRows.map(toFollowUpDigest);

        for (const row of currentRows) {
          const payload = dailyDigestSchema.parse(row.full_digest_json);
          const nextPayload = {
            ...payload,
            follow_up_from_yesterday: buildDailyFollowUp({
              current: toFollowUpDigest(row),
              previous,
            }),
          };
          await sql`
            update daily_digests
            set full_digest_json = ${sql.json(nextPayload)}, updated_at = now()
            where id = ${row.id}
          `;
          updated += 1;
        }
      }
    }

    console.log(`Updated follow-up context for ${updated} daily digest(s).`);
  } finally {
    await closeSql();
  }
}

function groupByDate(rows: DailyRow[]) {
  const byDate = new Map<string, DailyRow[]>();
  for (const row of rows) {
    byDate.set(row.digest_date, [...(byDate.get(row.digest_date) ?? []), row]);
  }
  return byDate;
}

function toFollowUpDigest(row: DailyRow): DailyFollowUpDigest {
  return {
    digestDate: row.digest_date,
    title: row.title,
    frontPageSummary: row.front_page_summary,
    whyItMatters: row.why_it_matters,
  };
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
