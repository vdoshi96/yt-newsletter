import { requireUser } from "@/lib/auth/current-user";
import { getCreatorsForUser } from "@/lib/creators";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

type WeeklyRow = {
  id: string;
  title: string;
  week_start: string;
  week_end: string;
  newsletter_markdown: string;
  ranked_topics: Array<{ topic: string; importance_score: number; why_it_matters: string }> | null;
};

export default async function WeeklyPage({
  searchParams,
}: {
  searchParams: Promise<{ creatorId?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const creators = await getCreatorsForUser(user.id);
  const creatorId = params.creatorId ?? creators[0]?.id;
  const digests = creatorId ? await getWeeklyDigests(user.id, creatorId) : [];

  return (
    <div className="space-y-6">
      <section className="newspaper-sheet">
        <p className="section-kicker">Sunday edition</p>
        <h2 className="mt-3 font-serif text-5xl font-black">Four weekly digests</h2>
        <p className="mt-4 max-w-3xl text-stone-700">
          The baseline view keeps the latest four seven-day digest slots for the past
          month, ranking important topics and focusing the learning plan on free resources.
        </p>
      </section>

      {digests.length === 0 ? (
        <section className="ink-panel">
          <p className="text-stone-600">No weekly digests yet. Run the one-month baseline seed and processor.</p>
        </section>
      ) : (
        digests.map((digest) => (
          <article key={digest.id} className="newspaper-sheet">
            <p className="section-kicker">
              {digest.week_start} to {digest.week_end}
            </p>
            <h3 className="mt-3 font-serif text-4xl font-black">{digest.title}</h3>
            <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
              <aside className="ink-panel">
                <h4 className="section-kicker">Ranked topics</h4>
                <ol className="mt-3 space-y-3 text-sm leading-6 text-stone-700">
                  {(digest.ranked_topics ?? []).map((topic) => (
                    <li key={topic.topic}>
                      <strong>{topic.topic}</strong>: {topic.why_it_matters}
                    </li>
                  ))}
                </ol>
              </aside>
              <div className="prose-newsletter whitespace-pre-wrap">{digest.newsletter_markdown}</div>
            </div>
          </article>
        ))
      )}
    </div>
  );
}

async function getWeeklyDigests(userId: string, creatorId: string) {
  const sql = getSql();
  return sql<WeeklyRow[]>`
    select
      weekly_digests.id,
      weekly_digests.title,
      weekly_digests.week_start::text as week_start,
      weekly_digests.week_end::text as week_end,
      weekly_digests.newsletter_markdown,
      weekly_digests.ranked_topics
    from weekly_digests
    join user_creators on user_creators.creator_id = weekly_digests.creator_id
    where user_creators.user_id = ${userId}
      and weekly_digests.creator_id = ${creatorId}
    order by weekly_digests.week_start desc
    limit 4
  `;
}
