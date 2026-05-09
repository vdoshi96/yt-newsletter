import { Headphones } from "lucide-react";
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
        <h2 className="mt-3 font-serif text-5xl font-black">Weekly podcast summaries</h2>
        <p className="mt-4 max-w-3xl text-stone-700">
          Podcast scripts are generated with weekly digests and stored as an archive.
          Audio appears when generated with Qwen TTS and Supabase Storage.
        </p>
      </section>

      {creatorId ? (
        <section className="ink-panel">
          <form method="get" className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
            <input type="hidden" name="creatorId" value={creatorId} />
            <label className="block text-sm font-bold text-stone-800">
              Week
              <input
                className="mt-2 h-11 w-full rounded border border-stone-300 bg-white px-3 text-stone-950"
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
            <button className="btn-secondary h-11 justify-center">Load week</button>
            <Link
              className="btn-secondary h-11 justify-center"
              href={`/app/podcasts?creatorId=${creatorId}&week=${currentWeekStart}`}
            >
              Jump to current
            </Link>
          </form>
        </section>
      ) : null}

      {!creatorId ? (
        <EmptyPodcast title="No creators yet" />
      ) : podcasts.length === 0 ? (
        <section className="ink-panel">
          <p className="text-stone-600">No podcast scripts or audio yet.</p>
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
  return (
    <article className="ink-panel">
      <div className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-stone-900 text-white">
          <Headphones className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="section-kicker">
            {podcast.week_start} to {podcast.week_end}
          </p>
          <h3 className="mt-2 font-serif text-3xl font-black">{podcast.title}</h3>
          {podcast.public_url ? (
            <audio className="mt-4 w-full" controls src={podcast.public_url} />
          ) : (
            <p className="mt-3 text-sm text-stone-600">
              Audio has not been generated for this week.
            </p>
          )}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-bold text-stone-800">
              Show podcast script
            </summary>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-700">
              {podcast.podcast_script}
            </p>
          </details>
        </div>
      </div>
    </article>
  );
}

function EmptyPodcast({ title }: { title: string }) {
  return (
    <section className="newspaper-sheet text-center">
      <p className="section-kicker">Empty podcast</p>
      <h2 className="mt-3 font-serif text-4xl font-black">{title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-stone-600">
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
      assets.public_url
    from weekly_digests
    join user_creators on user_creators.creator_id = weekly_digests.creator_id
    left join assets on assets.id = weekly_digests.podcast_audio_asset_id
    where user_creators.user_id = ${userId}
      and weekly_digests.creator_id = ${creatorId}
    order by weekly_digests.week_start desc
  `;
}
