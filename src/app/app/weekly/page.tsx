import { requireUser } from "@/lib/auth/current-user";
import { getCreatorsForUser } from "@/lib/creators";
import { getSql } from "@/lib/db";
import { weeklyDigestSchema, type WeeklyDigestPayload } from "@/lib/digests/schemas";
import { ExplanationLevelPanel } from "@/components/explanation-level-panel";

export const dynamic = "force-dynamic";

type WeeklyRow = {
  id: string;
  title: string;
  week_start: string;
  week_end: string;
  newsletter_markdown: string;
  ranked_topics: Array<{ topic: string; importance_score: number; why_it_matters: string }> | null;
  full_digest_json: unknown;
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
        <p className="section-kicker">This Week in AI</p>
        <h2 className="mt-3 font-serif text-5xl font-black">Weekly digest archive</h2>
        <p className="mt-4 max-w-3xl text-stone-700">
          The starter archive begins with four backfilled weeks. New completed
          Sunday-to-Saturday editions are stored here as they are generated.
        </p>
      </section>

      {digests.length === 0 ? (
        <section className="ink-panel">
          <p className="text-stone-600">No weekly digests yet. Run the one-month baseline seed and processor.</p>
        </section>
      ) : (
        digests.map((digest) => (
          <WeeklyDigestArticle key={digest.id} digest={digest} />
        ))
      )}
    </div>
  );
}

function WeeklyDigestArticle({ digest }: { digest: WeeklyRow }) {
  const parsed = parseWeeklyDigestRow(digest);
  return (
    <article className="newspaper-sheet">
      <p className="section-kicker">
        {digest.week_start} to {digest.week_end}
      </p>
      <h3 className="mt-3 font-serif text-4xl font-black">{parsed.title}</h3>
      <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <aside className="ink-panel">
          <h4 className="section-kicker">Ranked topics</h4>
          <ol className="mt-3 space-y-3 text-sm leading-6 text-stone-700">
            {parsed.ranked_topics.map((topic) => (
              <li key={topic.topic}>
                <strong>{topic.topic}</strong>: {topic.why_it_matters}
              </li>
            ))}
          </ol>
        </aside>
        <div className="space-y-6">
          <section className="article-column">
            <h4>Executive insights memo</h4>
            <p>{parsed.executive_insights_memo}</p>
          </section>
          <ExplanationLevelPanel
            title="Weekly explanation"
            levels={parsed.explanation_levels}
            className="article-column"
          />
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="ink-panel">
          <h4 className="section-kicker">Board-level implications</h4>
          <ul className="mt-3 space-y-3 text-sm leading-6 text-stone-700">
            {parsed.board_level_implications.length ? (
              parsed.board_level_implications.map((item) => <li key={item}>{item}</li>)
            ) : (
              <li>No board-level implications were stored for this week.</li>
            )}
          </ul>
        </section>
        <section className="ink-panel">
          <h4 className="section-kicker">Markets and investments</h4>
          <p className="mt-3 text-sm leading-6 text-stone-700">
            {parsed.market_investment_lens}
          </p>
        </section>
      </div>

      <section className="mt-6 ink-panel">
        <h4 className="section-kicker">Posts, videos, guides, and how-to&apos;s</h4>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {parsed.weekly_posts.length ? (
            parsed.weekly_posts.map((post) => (
              <article key={`${post.date}-${post.title}`} className="border-t border-stone-300 pt-3">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-500">
                  {post.date} / {post.type}
                </p>
                <h5 className="mt-2 font-serif text-xl font-black">{post.title}</h5>
                <p className="mt-2 text-sm leading-6 text-stone-700">{post.summary}</p>
                <p className="mt-2 text-sm leading-6 text-stone-700">
                  <strong>Why it matters:</strong> {post.why_it_matters}
                </p>
              </article>
            ))
          ) : (
            <p className="text-sm text-stone-600">No weekly posts were stored for this week.</p>
          )}
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          {parsed.research_briefs.map((brief) => (
            <article key={brief.title} className="article-column">
              <h4>{brief.title}</h4>
              <p>{brief.thesis}</p>
              {brief.implications.length ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">
                  {brief.implications.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
              <p className="mt-3 text-sm leading-6 text-stone-600">
                <strong>Uncertainty:</strong> {brief.uncertainty}
              </p>
            </article>
          ))}
        </div>
        <aside className="ink-panel">
          <h4 className="section-kicker">Source notes</h4>
          <ul className="mt-3 space-y-3 text-sm leading-6 text-stone-700">
            {parsed.source_notes.length ? (
              parsed.source_notes.map((source) => (
                <li key={`${source.date}-${source.label}`}>
                  <strong>{source.date} / {source.label}:</strong> {source.note}
                </li>
              ))
            ) : (
              <li>No external research source notes were stored for this week.</li>
            )}
          </ul>
        </aside>
      </section>

      <div className="prose-newsletter mt-6 whitespace-pre-wrap">{parsed.newsletter_markdown}</div>
    </article>
  );
}

function parseWeeklyDigestRow(digest: WeeklyRow): WeeklyDigestPayload {
  return weeklyDigestSchema.parse(
    digest.full_digest_json ?? {
      title: digest.title,
      newsletter_markdown: digest.newsletter_markdown,
      ranked_topics: digest.ranked_topics ?? [],
      what_changed: "No change summary is available.",
      what_to_do_next: [],
      free_learning_plan: [],
      podcast_script: "No podcast script is available.",
    },
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
      weekly_digests.ranked_topics,
      weekly_digests.full_digest_json
    from weekly_digests
    join user_creators on user_creators.creator_id = weekly_digests.creator_id
    where user_creators.user_id = ${userId}
      and weekly_digests.creator_id = ${creatorId}
    order by weekly_digests.week_start desc
  `;
}
