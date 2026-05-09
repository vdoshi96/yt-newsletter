import { Headphones } from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { getCreatorsForUser } from "@/lib/creators";
import { getSql } from "@/lib/db";

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
  searchParams: Promise<{ creatorId?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const creators = await getCreatorsForUser(user.id);
  const creatorId = params.creatorId ?? creators[0]?.id;
  const podcasts = creatorId ? await getPodcasts(user.id, creatorId) : [];

  return (
    <div className="space-y-6">
      <section className="newspaper-sheet">
        <p className="section-kicker">Audio desk</p>
        <h2 className="mt-3 font-serif text-5xl font-black">Weekly podcast summaries</h2>
        <p className="mt-4 max-w-3xl text-stone-700">
          Podcast scripts are generated with the weekly digest. Audio is created only when
          `GENERATE_AUDIO=true` and the Qwen TTS/Supabase Storage settings are available.
        </p>
      </section>

      {podcasts.length === 0 ? (
        <section className="ink-panel">
          <p className="text-stone-600">No podcast scripts or audio yet.</p>
        </section>
      ) : (
        podcasts.map((podcast) => (
          <article key={podcast.id} className="ink-panel">
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
        ))
      )}
    </div>
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
    limit 4
  `;
}
