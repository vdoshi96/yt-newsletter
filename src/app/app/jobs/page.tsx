import Link from "next/link";
import { AlertCircle, CheckCircle2, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { getIngestJobsForUser } from "@/lib/creators";
import { summarizeJobProgress } from "@/lib/jobs/progress";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ started?: string; processed?: string; queued?: string; warning?: string }>;
}) {
  const user = await requireUser();
  const [jobs, params] = await Promise.all([getIngestJobsForUser(user.id), searchParams]);

  return (
    <div className="space-y-6">
      <section className="newspaper-sheet">
        <p className="section-kicker">Press room</p>
        <h2 className="mt-3 text-5xl font-black tracking-tight text-slate-950">Ingestion jobs</h2>
        <p className="mt-4 max-w-2xl text-slate-600">
          Jobs are stored in the database, so you can leave and come back. Cron or the
          manual processor can continue queued work.
        </p>
        {params.started ? (
          <p className="mt-5 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
            Job queued: {params.started}
          </p>
        ) : null}
        {params.processed ? (
          <p className="mt-5 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
            Processor handled {params.processed} queue item(s).
          </p>
        ) : null}
        {params.queued ? (
          <p className="mt-5 rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-800">
            Queued {params.queued} new item(s).
          </p>
        ) : null}
        {params.warning ? (
          <p className="mt-5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {params.warning}
          </p>
        ) : null}
      </section>

      <div className="space-y-4">
        {jobs.length === 0 ? (
          <div className="ink-panel">
            <p className="text-slate-600">No jobs yet.</p>
            <Link className="mt-4 inline-flex btn-primary" href="/app/creators">
              <Plus aria-hidden className="size-4" />
              Start your first ingestion
            </Link>
          </div>
        ) : (
          jobs.map((job) => {
            const progress = summarizeJobProgress({
              totalCount: job.total_count,
              processedCount: job.processed_count,
              failedCount: job.failed_count,
              estimatedSeconds: job.estimated_seconds,
            });
            return (
              <article key={job.id} className="ink-panel">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="section-kicker">{job.status}</p>
                    <h3 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                      {job.creator_title ?? "Creator"}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600">
                      Current video: {job.current_video_title ?? "Waiting in queue"}
                    </p>
                  </div>
                  <p className="text-sm text-slate-600">
                    About {progress.estimatedSecondsRemaining}s remaining
                  </p>
                </div>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-600"
                    style={{ width: `${progress.percentComplete}%` }}
                  />
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                  <p>Total: {job.total_count}</p>
                  <p>Processed: {job.processed_count}</p>
                  <p className="inline-flex items-center gap-1">
                    {job.failed_count > 0 ? (
                      <AlertCircle aria-hidden className="size-4 text-red-600" />
                    ) : (
                      <CheckCircle2 aria-hidden className="size-4 text-emerald-600" />
                    )}
                    Failed: {job.failed_count}
                  </p>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
