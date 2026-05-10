import { CalendarDays, Headphones, RotateCcw } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { getCreatorsForUser } from "@/lib/creators";
import { getSql } from "@/lib/db";
import {
  getCurrentSundayWeekStart,
  resolveSelectedWeekStart,
} from "@/lib/weekly/navigation";

export const dynamic = "force-dynamic";

type PodcastRow = {
  id: string;
  title: string;
  week_start: string;
  week_end: string;
  podcast_script: string | null;
  public_url: string | null;
  podcast_status: string | null;
  podcast_generation_metadata: {
    status?: string;
    target_minutes?: number;
    word_count?: number;
    provider?: string;
    model?: string;
    cast_id?: string;
    generated_at?: string;
    error_message?: string;
  } | null;
  podcast_generated_at: string | null;
  podcast_model: string | null;
  asset_provider: string | null;
  asset_model: string | null;
  asset_generation_status: string | null;
};

export default async function PodcastsPage({
  searchParams,
}: {
  searchParams: Promise<{ creatorId?: string; week?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const creators = await getCreatorsForUser(user.id);
  const creatorId = params.creatorId ?? creators[0]?.id;
  const podcasts = creatorId ? await getPodcasts(user.id, creatorId) : [];
  const availableWeeks = podcasts.map((podcast) => podcast.week_start);
  const selectedWeekStart = resolveSelectedWeekStart(params.week, availableWeeks);
  const selectedPodcast =
    podcasts.find((podcast) => podcast.week_start === selectedWeekStart) ?? null;
  const currentWeekStart = getCurrentSundayWeekStart();

  return (
    <div className="space-y-6">
      <section className="newspaper-sheet">
        <p className="section-kicker">Audio desk</p>
        <h2 className="mt-3 text-5xl font-black tracking-tight text-slate-950">
          Weekly podcast summaries
        </h2>
        <p className="mt-4 max-w-3xl text-slate-600">
          Podcast scripts are generated from grounded weekly digests. Audio appears when the
          Gemini Flash multi-speaker path or an explicitly configured provider succeeds.
        </p>
      </section>

      {creatorId ? (
        <section className="ink-panel">
          <form method="get" className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
            <input type="hidden" name="creatorId" value={creatorId} />
            <label className="form-label">
              Week
              <input
                className="field-control mt-2"
                name="week"
                type="date"
                defaultValue={selectedWeekStart}
                list="available-podcast-weeks"
              />
              <datalist id="available-podcast-weeks">
                {availableWeeks.map((week) => (
                  <option key={week} value={week} />
                ))}
              </datalist>
            </label>
            <button className="btn-primary h-11 justify-center">
              <CalendarDays aria-hidden className="size-4" />
              Load week
            </button>
            <Link
              className="btn-secondary h-11 justify-center"
              href={`/app/podcasts?creatorId=${creatorId}&week=${currentWeekStart}`}
            >
              <RotateCcw aria-hidden className="size-4" />
              Jump to current
            </Link>
          </form>
        </section>
      ) : null}

      {!creatorId ? (
        <EmptyPodcast title="No creators yet" />
      ) : podcasts.length === 0 ? (
        <section className="ink-panel">
          <p className="text-slate-600">No podcast scripts or audio yet.</p>
        </section>
      ) : selectedPodcast ? (
        <PodcastArticle podcast={selectedPodcast} />
      ) : (
        <EmptyPodcast title="No podcast for this selected week" />
      )}
    </div>
  );
}

function PodcastArticle({ podcast }: { podcast: PodcastRow }) {
  const metadata = podcast.podcast_generation_metadata;
  const status = podcast.podcast_status === "failed" || podcast.asset_generation_status === "failed"
    ? "failed"
    : podcast.public_url
    ? "podcast_generated"
    : podcast.podcast_status ?? metadata?.status ?? "pending";
  const model = podcast.podcast_model ?? podcast.asset_model ?? metadata?.model ?? "unknown";
  const provider = podcast.asset_provider ?? metadata?.provider ?? "unknown";
  const generatedAt = podcast.podcast_generated_at ?? metadata?.generated_at ?? "not generated";
  return (
    <article className="ink-panel">
      <div className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
          <Headphones className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="section-kicker">
            {podcast.week_start} to {podcast.week_end}
          </p>
          <h3 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
            {podcast.title}
          </h3>
          <dl className="mt-4 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 md:grid-cols-2">
            <div>
              <dt className="font-bold text-slate-950">Status</dt>
              <dd>{formatStatus(status)}</dd>
            </div>
            <div>
              <dt className="font-bold text-slate-950">Generated</dt>
              <dd>{generatedAt}</dd>
            </div>
            <div>
              <dt className="font-bold text-slate-950">Voice/model</dt>
              <dd>
                {provider} / {model}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-950">Script target</dt>
              <dd>
                {metadata?.target_minutes ?? 30} min
                {metadata?.word_count ? ` / ${metadata.word_count.toLocaleString()} words` : ""}
              </dd>
            </div>
          </dl>
          {podcast.public_url ? (
            <audio className="mt-4 w-full" controls src={podcast.public_url} />
          ) : status === "failed" ? (
            <p className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              Audio generation failed{metadata?.error_message ? `: ${metadata.error_message}` : "."}
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              Audio has not been generated for this week. This is not final placeholder audio.
            </p>
          )}
          {podcast.podcast_script ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-bold text-slate-800">
                Show podcast script
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                {podcast.podcast_script}
              </p>
            </details>
          ) : (
            <p className="mt-4 text-sm text-slate-600">No grounded podcast script is stored yet.</p>
          )}
        </div>
      </div>
    </article>
  );
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

function EmptyPodcast({ title }: { title: string }) {
  return (
    <section className="newspaper-sheet text-center">
      <p className="section-kicker">Empty podcast</p>
      <h2 className="mt-3 text-4xl font-black tracking-tight text-slate-950">{title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-slate-600">
        Weekly podcast scripts appear with weekly digests. Audio appears after podcast generation.
      </p>
    </section>
  );
}

async function getPodcasts(userId: string, creatorId: string) {
  const sql = getSql();
  return sql<PodcastRow[]>`
    select
      weekly_digests.id,
      weekly_digests.title,
      weekly_digests.week_start::text as week_start,
      weekly_digests.week_end::text as week_end,
      weekly_digests.podcast_script,
      weekly_digests.podcast_status,
      weekly_digests.podcast_generation_metadata,
      weekly_digests.podcast_generated_at::text as podcast_generated_at,
      weekly_digests.podcast_model,
      assets.provider as asset_provider,
      assets.model as asset_model,
      assets.generation_status as asset_generation_status,
      assets.public_url
    from weekly_digests
    join user_creators on user_creators.creator_id = weekly_digests.creator_id
    left join assets on assets.id = weekly_digests.podcast_audio_asset_id
    where user_creators.user_id = ${userId}
      and weekly_digests.creator_id = ${creatorId}
      and weekly_digests.grounding_status = 'grounded'
      and weekly_digests.processing_status = 'digest_generated'
      and coalesce(weekly_digests.source_digest_count, 0) > 0
    order by weekly_digests.week_start desc
  `;
}
