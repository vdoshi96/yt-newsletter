import Link from "next/link";
import { getSql } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { getIngestJobsForUser } from "@/lib/creators";
import { summarizeJobProgress } from "@/lib/jobs/progress";

export const dynamic = "force-dynamic";

export default async function AppHome() {
  const user = await requireUser();
  const [jobs, stats] = await Promise.all([
    getIngestJobsForUser(user.id),
    getDashboardStats(user.id),
  ]);
  const latestJob = jobs[0];
  const progress = latestJob
    ? summarizeJobProgress({
        totalCount: latestJob.total_count,
        processedCount: latestJob.processed_count,
        failedCount: latestJob.failed_count,
        estimatedSeconds: latestJob.estimated_seconds,
      })
    : null;

  return (
    <div className="space-y-8">
      <section className="newspaper-sheet">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="section-kicker">Today&apos;s front page</p>
            <h2 className="mt-3 max-w-3xl font-serif text-5xl font-black leading-tight">
              A calmer way to keep up with fast YouTube creators.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-700">
              Paste a creator URL, backfill a few recent videos, and read a grounded
              digest that separates transcript-backed claims from uncertainty.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="btn-primary" href="/app/creators">
                Add or ingest creator
              </Link>
              <Link className="btn-secondary" href="/app/daily">
                Read daily dashboard
              </Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <Stat label="Creators" value={stats.creatorCount} />
            <Stat label="Daily digests" value={stats.dailyCount} />
            <Stat label="Weekly digests" value={stats.weeklyCount} />
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="ink-panel">
          <h3 className="section-kicker">Starter creator</h3>
          <p className="mt-2 font-serif text-3xl font-black">Nate B. Jones</p>
          <p className="mt-3 text-sm leading-6 text-stone-700">
            Seeded as the first creator. Ingestion is manual, with a default backfill of
            five videos.
          </p>
          <Link className="mt-5 inline-flex btn-secondary" href="/app/creators">
            Start a backfill
          </Link>
        </div>
        <div className="ink-panel">
          <h3 className="section-kicker">Latest job</h3>
          {latestJob && progress ? (
            <div className="mt-3 space-y-3">
              <p className="font-serif text-2xl font-black">{latestJob.creator_title}</p>
              <p className="text-sm text-stone-600">Status: {latestJob.status}</p>
              <div className="h-3 overflow-hidden rounded bg-stone-200">
                <div
                  className="h-full bg-stone-900"
                  style={{ width: `${progress.percentComplete}%` }}
                />
              </div>
              <p className="text-sm text-stone-600">
                {progress.completedCount} of {latestJob.total_count} videos accounted for.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-stone-600">No ingestion jobs yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-y border-stone-300 py-5">
      <p className="font-serif text-4xl font-black">{value}</p>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-500">{label}</p>
    </div>
  );
}

async function getDashboardStats(userId: string) {
  const sql = getSql();
  const rows = await sql<Array<{ creator_count: number; daily_count: number; weekly_count: number }>>`
    select
      (select count(*)::int from user_creators where user_id = ${userId}) as creator_count,
      (
        select count(*)::int
        from daily_digests
        join user_creators on user_creators.creator_id = daily_digests.creator_id
        where user_creators.user_id = ${userId}
      ) as daily_count,
      (
        select count(*)::int
        from weekly_digests
        join user_creators on user_creators.creator_id = weekly_digests.creator_id
        where user_creators.user_id = ${userId}
      ) as weekly_count
  `;
  return {
    creatorCount: rows[0]?.creator_count ?? 0,
    dailyCount: rows[0]?.daily_count ?? 0,
    weeklyCount: rows[0]?.weekly_count ?? 0,
  };
}
