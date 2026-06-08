import Link from "next/link";
import { CalendarDays, RotateCcw } from "lucide-react";
import { DigestArchiveNavigation } from "@/components/digest-archive-navigation";
import { DateKeyboardNavigation } from "@/components/date-keyboard-navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getCatalogFirstWeeklyStart } from "@/lib/catalog";
import { getCreatorsForUser } from "@/lib/creators";
import { getSql } from "@/lib/db";
import { getAdjacentArchiveValue } from "@/lib/digests/navigation";
import { weeklyDigestSchema, type WeeklyDigestPayload } from "@/lib/digests/schemas";
import { isFinalWeeklyDigestRow } from "@/lib/digests/rendering";
import { ExplanationLevelPanel } from "@/components/explanation-level-panel";
import { resolveSelectedWeekStart } from "@/lib/weekly/navigation";

export const dynamic = "force-dynamic";

type WeeklyRow = {
  id: string;
  title: string;
  week_start: string;
  week_end: string;
  newsletter_markdown: string;
  ranked_topics: Array<{ topic: string; importance_score: number; why_it_matters: string }> | null;
  full_digest_json: unknown;
  source_digest_count: number | null;
  source_date_range: { start?: string; end?: string } | null;
  grounding_status: string | null;
  generation_model: string | null;
  generated_at: string | null;
};

export default async function WeeklyPage({
  searchParams,
}: {
  searchParams: Promise<{ creatorId?: string; week?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const creators = await getCreatorsForUser(user.id);
  const creatorId = params.creatorId ?? creators[0]?.id;
  const digests = creatorId ? await getWeeklyDigests(user.id, creatorId) : [];
  const finalDigests = digests.filter(isFinalWeeklyDigestRow);
  const availableWeeks = finalDigests.map((digest) => digest.week_start).sort();
  const selectedWeekStart = resolveSelectedWeekStart(params.week, availableWeeks);
  const latestPublishedWeekStart = availableWeeks.at(-1) ?? selectedWeekStart;
  const selectedWeekHref = creatorId
    ? buildDigestHref("/app/weekly", { creatorId, week: selectedWeekStart })
    : "/app/weekly";
  const previousWeekStart = getAdjacentArchiveValue(selectedWeekStart, availableWeeks, -1);
  const nextWeekStart = getAdjacentArchiveValue(selectedWeekStart, availableWeeks, 1);
  const previousWeekHref =
    creatorId && previousWeekStart
      ? buildDigestHref("/app/weekly", { creatorId, week: previousWeekStart })
      : undefined;
  const nextWeekHref =
    creatorId && nextWeekStart
      ? buildDigestHref("/app/weekly", { creatorId, week: nextWeekStart })
      : undefined;
  const selectedDigest =
    finalDigests.find((digest) => digest.week_start === selectedWeekStart) ??
    digests.find((digest) => digest.week_start === selectedWeekStart) ??
    null;

  return (
    <div className="space-y-6">
      <DateKeyboardNavigation
        previousHref={previousWeekHref ?? selectedWeekHref}
        nextHref={nextWeekHref ?? selectedWeekHref}
      />
      <section className="newspaper-sheet">
        <p className="section-kicker">This Week in AI</p>
        <h2 className="mt-3 text-5xl font-black tracking-tight text-slate-950">
          Weekly digest archive
        </h2>
        <p className="mt-4 max-w-3xl text-slate-600">
          The archive starts with the March 2026 catalog and stores completed
          Saturday-through-Friday editions after the Friday close.
        </p>
      </section>

      {creatorId ? (
        <section className="ink-panel">
          <DigestArchiveNavigation
            previousHref={previousWeekHref}
            previousLabel="Previous digest"
            nextHref={nextWeekHref}
            nextLabel="Next digest"
          />
          <form method="get" className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
            <input type="hidden" name="creatorId" value={creatorId} />
            <label className="form-label">
              Week
              <input
                className="field-control mt-2"
                name="week"
                type="date"
                defaultValue={selectedWeekStart}
                list="available-weekly-digest-weeks"
              />
              <datalist id="available-weekly-digest-weeks">
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
              href={`/app/weekly?creatorId=${creatorId}&week=${latestPublishedWeekStart}`}
            >
              <RotateCcw aria-hidden className="size-4" />
              Jump to latest published
            </Link>
          </form>
        </section>
      ) : null}

      {!creatorId ? (
        <EmptyWeek title="No creators yet" />
      ) : digests.length === 0 ? (
        <section className="ink-panel">
          <p className="text-slate-600">
            No weekly digests yet. Run the one-month baseline seed and processor.
          </p>
        </section>
      ) : selectedDigest ? (
        <WeeklyDigestArticle digest={selectedDigest} />
      ) : (
        <EmptyWeek title="No weekly digest for this selected week" />
      )}
    </div>
  );
}

function WeeklyDigestArticle({ digest }: { digest: WeeklyRow }) {
  if (!isFinalWeeklyDigestRow(digest)) {
    return <BlockedWeeklyDigest digest={digest} />;
  }
  const parsed = parseWeeklyDigestRow(digest);
  return (
    <article className="newspaper-sheet">
      <p className="section-kicker">
        {digest.week_start} to {digest.week_end}
      </p>
      <h3 className="mt-3 text-4xl font-black tracking-tight text-slate-950">{parsed.title}</h3>
      <WeeklyMetadata digest={digest} parsed={parsed} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <aside className="ink-panel">
          <h4 className="section-kicker">Ranked topics</h4>
          <ol className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
            {parsed.ranked_topics.map((topic) => (
              <li key={topic.topic}>
                <strong>{topic.topic}</strong>: {topic.why_it_matters}
              </li>
            ))}
          </ol>
        </aside>
        <div className="space-y-6">
          <section className="article-column">
            <h4>What changed</h4>
            <div className="space-y-3">{renderProseParagraphs(parsed.what_changed)}</div>
          </section>
          <section className="article-column">
            <h4>Executive insights memo</h4>
            <div className="space-y-3">{renderProseParagraphs(parsed.executive_insights_memo)}</div>
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
          <ul className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
            {parsed.board_level_implications.length ? (
              parsed.board_level_implications.map((item) => <li key={item}>{item}</li>)
            ) : (
              <li>No board-level implications were stored for this week.</li>
            )}
          </ul>
        </section>
        <section className="ink-panel">
          <h4 className="section-kicker">Markets and investments</h4>
          <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
            {renderProseParagraphs(parsed.market_investment_lens)}
          </div>
        </section>
      </div>

      <section className="mt-6">
        <h4 className="section-kicker">Research and missing context</h4>
        <div className="grid gap-4 lg:grid-cols-2">
          {parsed.research_briefs.map((brief) => (
            <article key={brief.title} className="article-column">
              <h4>{brief.title}</h4>
              <div className="space-y-3">{renderProseParagraphs(brief.thesis)}</div>
              {brief.implications.length ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
                  {brief.implications.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
              <p className="mt-3 text-sm leading-6 text-slate-600">
                <strong>Uncertainty:</strong> {brief.uncertainty}
              </p>
            </article>
          ))}
        </div>
      </section>

      <NewsletterMarkdown markdown={parsed.newsletter_markdown} />
    </article>
  );
}

function BlockedWeeklyDigest({ digest }: { digest: WeeklyRow }) {
  return (
    <section className="newspaper-sheet">
      <p className="section-kicker">Weekly digest blocked</p>
      <h3 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
        This week is waiting for grounded regeneration
      </h3>
      <p className="mt-3 max-w-2xl text-slate-600">
        The dashboard is not rendering placeholder or pending weekly content as a final digest.
      </p>
      <dl className="mt-5 grid gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 md:grid-cols-2">
        <div>
          <dt className="font-bold">Week</dt>
          <dd>
            {digest.week_start} to {digest.week_end}
          </dd>
        </div>
        <div>
          <dt className="font-bold">Grounding</dt>
          <dd>{digest.grounding_status ?? "pending"}</dd>
        </div>
        <div>
          <dt className="font-bold">Source digests</dt>
          <dd>{digest.source_digest_count ?? 0}</dd>
        </div>
        <div>
          <dt className="font-bold">Model</dt>
          <dd>{digest.generation_model ?? "not generated"}</dd>
        </div>
      </dl>
    </section>
  );
}

function WeeklyMetadata({
  digest,
  parsed,
}: {
  digest: WeeklyRow;
  parsed: WeeklyDigestPayload;
}) {
  const grounding = parsed.weekly_grounding;
  const generatedAt = digest.generated_at ?? grounding.generated_at ?? "unknown";
  const model = digest.generation_model ?? grounding.generation_model ?? "unknown";
  const grounded = (digest.grounding_status ?? (grounding.grounded ? "grounded" : "pending")) === "grounded";
  const rangeStart = digest.source_date_range?.start ?? grounding.source_date_range?.start ?? digest.week_start;
  const rangeEnd = digest.source_date_range?.end ?? grounding.source_date_range?.end ?? digest.week_end;

  return (
    <dl className="mt-4 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 md:grid-cols-2 lg:grid-cols-4">
      <div>
        <dt className="font-bold text-slate-950">Generated</dt>
        <dd>{generatedAt}</dd>
      </div>
      <div>
        <dt className="font-bold text-slate-950">Source range</dt>
        <dd>
          {rangeStart} to {rangeEnd}
        </dd>
      </div>
      <div>
        <dt className="font-bold text-slate-950">Model</dt>
        <dd>{model}</dd>
      </div>
      <div>
        <dt className="font-bold text-slate-950">Grounding</dt>
        <dd>{grounded ? "Grounded in daily digests" : "Needs regeneration"}</dd>
      </div>
    </dl>
  );
}

function EmptyWeek({ title }: { title: string }) {
  return (
    <section className="newspaper-sheet text-center">
      <p className="section-kicker">Empty week</p>
      <h2 className="mt-3 text-4xl font-black tracking-tight text-slate-950">{title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-slate-600">
        Weekly editions appear after daily digests exist for a completed Saturday-through-Friday week.
      </p>
    </section>
  );
}

function NewsletterMarkdown({ markdown }: { markdown: string }) {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="prose-newsletter mt-6 space-y-4">
      {blocks.map((block, index) => {
        if (block.startsWith("### ")) {
          return <h5 key={index} className="text-xl font-black text-slate-950">{block.slice(4)}</h5>;
        }
        if (block.startsWith("## ")) {
          return <h4 key={index} className="text-2xl font-black text-slate-950">{block.slice(3)}</h4>;
        }
        if (block.startsWith("# ")) {
          return <h4 key={index} className="text-3xl font-black text-slate-950">{block.slice(2)}</h4>;
        }
        if (block.split("\n").every((line) => line.trim().startsWith("- "))) {
          return (
            <ul key={index} className="list-disc space-y-2 pl-5">
              {block.split("\n").map((line) => (
                <li key={line}>{line.trim().slice(2)}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{block.replace(/\n/g, " ")}</p>;
      })}
    </div>
  );
}

function renderProseParagraphs(text: string) {
  return splitProseParagraphs(text).map((paragraph, index) => (
    <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
  ));
}

function splitProseParagraphs(text: string) {
  const explicit = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (explicit.length > 1) return explicit;

  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 560) return cleaned ? [cleaned] : [];

  const sentences = cleaned.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [cleaned];
  const paragraphs: string[] = [];
  let current = "";
  for (const sentence of sentences.map((item) => item.trim()).filter(Boolean)) {
    if (!current) {
      current = sentence;
    } else if (`${current} ${sentence}`.length <= 560) {
      current = `${current} ${sentence}`;
    } else {
      paragraphs.push(current);
      current = sentence;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
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
    },
  );
}

function buildDigestHref(pathname: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  return `${pathname}?${query.toString()}`;
}

async function getWeeklyDigests(userId: string, creatorId: string) {
  const sql = getSql();
  const firstWeeklyStart = getCatalogFirstWeeklyStart();
  return sql<WeeklyRow[]>`
    select
      weekly_digests.id,
      weekly_digests.title,
      weekly_digests.week_start::text as week_start,
      weekly_digests.week_end::text as week_end,
      weekly_digests.newsletter_markdown,
      weekly_digests.ranked_topics,
      weekly_digests.full_digest_json,
      weekly_digests.source_digest_count,
      weekly_digests.source_date_range,
      weekly_digests.grounding_status,
      weekly_digests.generation_model,
      weekly_digests.generated_at::text as generated_at
    from weekly_digests
    join user_creators on user_creators.creator_id = weekly_digests.creator_id
    where user_creators.user_id = ${userId}
      and weekly_digests.creator_id = ${creatorId}
      and weekly_digests.week_start >= ${firstWeeklyStart}::date
    order by weekly_digests.week_start desc
  `;
}
