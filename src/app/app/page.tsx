import Link from "next/link";
import {
  ArrowRight,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileText,
  Newspaper,
  Plus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ExplanationLevelPanel } from "@/components/explanation-level-panel";
import { getSql } from "@/lib/db";
import { dailyDigestSchema } from "@/lib/digests/schemas";
import { requireUser } from "@/lib/auth/current-user";
import { getIngestJobsForUser } from "@/lib/creators";
import { summarizeJobProgress } from "@/lib/jobs/progress";

export const dynamic = "force-dynamic";
const MAIN_VIDEO_MIN_SECONDS = 300;

export default async function AppHome() {
  const user = await requireUser();
  const [jobs, stats, activity, latestDaily] = await Promise.all([
    getIngestJobsForUser(user.id),
    getDashboardStats(user.id),
    getRecentActivity(user.id),
    getLatestDailyPreview(user.id),
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
      <section className="grid gap-5 xl:grid-cols-2">
        <div className="newspaper-sheet">
          <div className="max-w-3xl">
            <h2 className="max-w-3xl text-4xl font-black leading-[1.08] tracking-tight text-slate-950 md:text-[2.35rem]">
              A calmer way to keep up with fast YouTube creators.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Paste a creator URL, backfill a month or more of videos, and read archived
              weekly editions that separate source-backed claims from uncertainty.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="btn-primary" href="/app/creators">
                <Plus aria-hidden className="size-4" />
                Add or ingest creator
              </Link>
              <Link className="btn-secondary" href="/app/daily">
                <FileText aria-hidden className="size-4" />
                Read daily dashboard
              </Link>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat icon={Users} label="Creators" value={stats.creatorCount} />
            <Stat icon={Newspaper} label="30-day daily digests" value={stats.dailyCount} />
            <Stat icon={CalendarDays} label="Weekly digests" value={stats.weeklyCount} />
            <Stat icon={Users} label="Starter creator" value="Nate B. Jones" compact />
          </div>

          {latestJob && progress ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <CheckCircle2 aria-hidden className="mt-1 size-8 shrink-0 text-emerald-600" />
                  <div>
                    <h3 className="text-lg font-black text-slate-950">
                      Latest job {latestJob.status.replace(/_/g, " ")}
                    </h3>
                    <p className="mt-1 text-sm font-medium text-slate-700">
                      {latestJob.creator_title ?? "Creator"}
                    </p>
                  </div>
                </div>
                <p className={`text-sm font-bold capitalize ${statusTextClass(latestJob.status)}`}>
                  {latestJob.status.replace(/_/g, " ")}
                </p>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-600"
                    style={{ width: `${progress.percentComplete}%` }}
                  />
                </div>
                <p className="text-sm font-medium text-slate-600">{progress.percentComplete}%</p>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {progress.completedCount} of {latestJob.total_count} videos accounted for.
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-4">
              <h3 className="text-lg font-black text-slate-950">No ingestion jobs yet</h3>
              <p className="mt-1 text-sm text-slate-600">
                Start a backfill to populate the archive.
              </p>
            </div>
          )}
        </div>

        <DailyPreview preview={latestDaily} />
      </section>

      <RecentActivity activity={activity} />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="ink-panel">
          <h3 className="section-kicker">Starter creator</h3>
          <p className="mt-2 text-2xl font-black text-slate-950">Nate B. Jones</p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Seeded as the first creator. The baseline run queues the four most recent
            completed Saturday-through-Friday weeks, starts with four weekly editions,
            and keeps future weeks as an archive.
          </p>
          <Link className="mt-5 inline-flex btn-secondary" href="/app/creators">
            Start a backfill
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        <div className="ink-panel">
          <h3 className="section-kicker">Archive status</h3>
          <p className="mt-2 text-2xl font-black text-slate-950">Source-grounded editions</p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Daily and weekly views preserve the same records while giving you controls for
            dates, Saturday-through-Friday weeks, explanation depth, podcast scripts, and
            operational refreshes.
          </p>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-600"
              style={{ width: stats.dailyCount > 0 ? "100%" : "0%" }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  compact = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  compact?: boolean;
}) {
  return (
    <div className="metric-card">
      <Icon aria-hidden className="size-4 text-blue-600" />
      <p
        className={
          compact
            ? "mt-2 text-base font-black leading-tight text-slate-950"
            : "mt-2 text-2xl font-black text-slate-950"
        }
      >
        {value}
      </p>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">{label}</p>
    </div>
  );
}

function DailyPreview({ preview }: { preview: DailyPreviewRow | null }) {
  if (!preview) {
    return (
      <section className="newspaper-sheet">
        <h3 className="text-lg font-black text-slate-950">Daily digest preview</h3>
        <p className="mt-2 text-sm text-slate-600">
          Stored daily editions will appear here after the first ingestion completes.
        </p>
        <Link className="mt-5 inline-flex btn-primary" href="/app/creators">
          <Plus aria-hidden className="size-4" />
          Add or ingest creator
        </Link>
      </section>
    );
  }

  const digest = dailyDigestSchema.parse(preview.full_digest_json);
  const digestHref = `/app/daily?creatorId=${preview.creator_id}&date=${preview.digest_date}&videoId=${preview.video_id}`;
  const takeaways = digest.what_to_do_next.length
    ? digest.what_to_do_next
    : digest.free_learning_plan;

  return (
    <section className="newspaper-sheet">
      <div className="border-b border-slate-200 pb-4">
        <h3 className="text-lg font-black text-slate-950">Daily digest preview</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-[0.7fr_1.1fr_auto] md:items-end">
          <label className="form-label">
            Date
            <input className="field-control mt-2" type="date" value={preview.digest_date} readOnly />
          </label>
          <label className="form-label">
            Video
            <select className="field-control mt-2" defaultValue={preview.video_id}>
              <option value={preview.video_id}>
                {preview.video_title ?? digest.title}
              </option>
            </select>
          </label>
          <Link className="btn-primary h-11 justify-center" href={digestHref}>
            <CalendarDays aria-hidden className="size-4" />
            Load edition
          </Link>
        </div>
      </div>

      <div className="mt-5">
        <h4 className="text-2xl font-black leading-tight tracking-tight text-slate-950">
          {digest.title}
        </h4>
        <p className="mt-2 text-sm text-slate-500">
          {preview.digest_date} · {formatCreatorTitle(preview.creator_title)}
        </p>
        <dl className="mt-4 grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2">
          <div>
            <dt className="font-bold text-slate-950">Generated</dt>
            <dd>{preview.generated_at ?? "unknown"}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-950">Model</dt>
            <dd>{preview.generation_model ?? "unknown"}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-950">Grounding</dt>
            <dd>{preview.grounding_status ?? "pending"}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-950">Transcript</dt>
            <dd>
              {preview.transcript_source ?? "missing"} /{" "}
              {(preview.transcript_length ?? 0).toLocaleString()} chars
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-5 border-t border-slate-200 pt-4">
        <h4 className="text-lg font-black text-slate-950">Front page summary</h4>
        <p className="mt-2 text-sm leading-6 text-slate-600">{digest.front_page_summary}</p>
      </div>

      <aside className="mt-5 rounded-lg border border-amber-300 bg-amber-50/60 p-4">
        <h4 className="flex items-center gap-2 text-base font-black text-amber-800">
          <AlertTriangle aria-hidden className="size-4" />
          Skepticism / uncertainty
        </h4>
        <p className="mt-2 text-sm leading-6 text-slate-700">{digest.skepticism_notes}</p>
      </aside>

      <ExplanationLevelPanel
        title="Explanation level"
        levels={digest.explanation_levels}
        className="mt-5 border-t border-slate-200 pt-4"
      />

      <div className="mt-5 border-t border-slate-200 pt-4">
        <h4 className="text-lg font-black text-slate-950">Key takeaways</h4>
        <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
          {takeaways.slice(0, 3).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function RecentActivity({ activity }: { activity: ActivityRow[] }) {
  return (
    <section className="newspaper-sheet">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h3 className="text-lg font-black text-slate-950">Recent activity</h3>
          <p className="mt-1 text-sm text-slate-600">
            Latest ingest and digest updates from the archive.
          </p>
        </div>
        <Link className="btn-ghost px-0" href="/app/jobs">
          View jobs
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="py-3 pr-4">Time</th>
              <th className="py-3 pr-4">Type</th>
              <th className="py-3 pr-4">Creator</th>
              <th className="py-3 pr-4">Detail</th>
              <th className="py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {activity.length ? (
              activity.map((item) => (
                <tr key={`${item.type}-${item.occurred_at}-${item.detail}`}>
                  <td className="whitespace-nowrap py-3 pr-4 text-slate-500">
                    {formatDateTime(item.occurred_at)}
                  </td>
                  <td className="py-3 pr-4 font-medium text-slate-950">{item.type}</td>
                  <td className="py-3 pr-4">{formatCreatorTitle(item.creator_title)}</td>
                  <td className="whitespace-nowrap py-3 pr-4">
                    {item.detail ?? "Stored update"}
                  </td>
                  <td className="py-3">
                    <span
                      className={`inline-flex items-center gap-1 whitespace-nowrap font-bold capitalize ${statusTextClass(item.status)}`}
                    >
                      <CheckCircle2 aria-hidden className="size-4" />
                      {item.status.replace(/_/g, " ")}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="py-4 text-slate-600" colSpan={5}>
                  No activity has been recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
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
        join videos on videos.id = daily_digests.video_id
        join user_creators on user_creators.creator_id = daily_digests.creator_id
        where user_creators.user_id = ${userId}
          and daily_digests.grounding_status = 'grounded'
          and daily_digests.digest_date >= current_date - make_interval(days => 30)
          and coalesce(videos.duration_seconds, 0) >= ${MAIN_VIDEO_MIN_SECONDS}
          and lower(coalesce(videos.title, '')) not like '%#shorts%'
          and lower(coalesce(videos.title, '')) not like '% #short %'
      ) as daily_count,
      (
        select count(*)::int
        from weekly_digests
        join user_creators on user_creators.creator_id = weekly_digests.creator_id
        where user_creators.user_id = ${userId}
          and weekly_digests.grounding_status = 'grounded'
      ) as weekly_count
  `;
  return {
    creatorCount: rows[0]?.creator_count ?? 0,
    dailyCount: rows[0]?.daily_count ?? 0,
    weeklyCount: rows[0]?.weekly_count ?? 0,
  };
}

type ActivityRow = {
  occurred_at: string;
  type: string;
  creator_title: string | null;
  detail: string | null;
  status: string;
};

type DailyPreviewRow = {
  creator_id: string;
  creator_title: string | null;
  video_id: string;
  video_title: string | null;
  digest_date: string;
  generation_model: string | null;
  generated_at: string | null;
  transcript_source: string | null;
  transcript_length: number | null;
  grounding_status: string | null;
  full_digest_json: unknown;
};

async function getRecentActivity(userId: string) {
  const sql = getSql();
  return sql<ActivityRow[]>`
    (
      select
        ingest_jobs.created_at::text as occurred_at,
        'Backfill' as type,
        creators.title as creator_title,
        (ingest_jobs.processed_count::text || ' of ' || ingest_jobs.total_count::text || ' videos') as detail,
        coalesce(ingest_jobs.status, 'queued') as status
      from ingest_jobs
      join creators on creators.id = ingest_jobs.creator_id
      where ingest_jobs.user_id = ${userId}
    )
    union all
    (
      select
        daily_digests.created_at::text as occurred_at,
        'Daily digest' as type,
        creators.title as creator_title,
        coalesce(daily_digests.digest_date::text, videos.title, daily_digests.title) as detail,
        coalesce(daily_digests.processing_status, daily_digests.grounding_status, 'pending') as status
      from daily_digests
      join creators on creators.id = daily_digests.creator_id
      join videos on videos.id = daily_digests.video_id
      join user_creators on user_creators.creator_id = daily_digests.creator_id
      where user_creators.user_id = ${userId}
        and coalesce(videos.duration_seconds, 0) >= ${MAIN_VIDEO_MIN_SECONDS}
        and lower(coalesce(videos.title, '')) not like '%#shorts%'
        and lower(coalesce(videos.title, '')) not like '% #short %'
    )
    order by occurred_at desc
    limit 4
  `;
}

async function getLatestDailyPreview(userId: string) {
  const sql = getSql();
  const rows = await sql<DailyPreviewRow[]>`
    select
      daily_digests.creator_id,
      creators.title as creator_title,
      daily_digests.video_id,
      videos.title as video_title,
      daily_digests.digest_date::text as digest_date,
      daily_digests.generation_model,
      daily_digests.generated_at::text as generated_at,
      daily_digests.transcript_source,
      daily_digests.transcript_length,
      daily_digests.grounding_status,
      daily_digests.full_digest_json
    from daily_digests
    join creators on creators.id = daily_digests.creator_id
    join videos on videos.id = daily_digests.video_id
    join user_creators on user_creators.creator_id = daily_digests.creator_id
    where user_creators.user_id = ${userId}
      and daily_digests.grounding_status = 'grounded'
      and daily_digests.transcript_source = 'youtube_transcript_free'
      and coalesce(videos.duration_seconds, 0) >= ${MAIN_VIDEO_MIN_SECONDS}
      and lower(coalesce(videos.title, '')) not like '%#shorts%'
      and lower(coalesce(videos.title, '')) not like '% #short %'
    order by daily_digests.digest_date desc, videos.published_at desc nulls last
    limit 1
  `;
  return rows[0] ?? null;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCreatorTitle(title: string | null) {
  if (!title) return "Creator";
  const label = title.includes("|") ? title.split("|").at(-1)?.trim() ?? title : title;
  return label.replace("Nate B Jones", "Nate B. Jones");
}

function statusTextClass(status: string) {
  if (status === "failed") return "text-red-700";
  if (status === "waiting_for_transcript" || status === "processing" || status === "queued") {
    return "text-amber-700";
  }
  return "text-emerald-700";
}
