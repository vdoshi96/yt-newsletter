import type { DailyDigestPayload } from "@/lib/digests/schemas";
import { ExplanationLevelPanel } from "@/components/explanation-level-panel";

export function DigestRenderer({ digest }: { digest: DailyDigestPayload }) {
  return (
    <article className="newspaper-sheet">
      <header className="border-b border-slate-200 pb-5">
        <p className="section-kicker">
          Daily creator edition
        </p>
        <h1 className="mt-3 max-w-4xl text-4xl font-black leading-tight tracking-tight text-slate-950 md:text-5xl">
          {digest.title}
        </h1>
        <p className="mt-3 max-w-3xl text-lg leading-8 text-slate-600">{digest.dek}</p>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section>
          <h2 className="section-kicker">Front page summary</h2>
          <p className="newspaper-lede">{digest.front_page_summary}</p>
        </section>
        <aside className="rounded-lg border border-amber-300 bg-amber-50/60 p-5">
          <h2 className="text-base font-black text-amber-800">Skepticism / uncertainty</h2>
          <p className="mt-3 text-sm leading-6 text-slate-700">{digest.skepticism_notes}</p>
        </aside>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <DigestSection title="What the creator said" items={digest.what_creator_said} />
        <DigestSection title="What to do next" items={digest.what_to_do_next} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr_0.85fr]">
        <ExplanationLevelPanel
          title="Plain-English explanation"
          levels={digest.explanation_levels}
        />
        <section className="article-column">
          <h2>Why this matters</h2>
          <p>{digest.why_it_matters}</p>
        </section>
        <section className="article-column">
          <h2>Follow-up from yesterday</h2>
          <p>{digest.follow_up_from_yesterday}</p>
        </section>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="ink-panel">
          <h2 className="section-kicker">Terms to understand</h2>
          <dl className="space-y-3">
            {digest.glossary.length === 0 ? (
              <p className="text-sm text-slate-600">No glossary terms were extracted yet.</p>
            ) : (
              digest.glossary.map((term) => (
                <div key={term.term}>
                  <dt className="font-bold text-slate-950">{term.term}</dt>
                  <dd className="text-sm leading-6 text-slate-600">{term.definition}</dd>
                </div>
              ))
            )}
          </dl>
        </section>
        <DigestSection title="Free learning path" items={digest.free_learning_plan} />
      </div>
    </article>
  );
}

function DigestSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="ink-panel">
      <h2 className="section-kicker">{title}</h2>
      <ul className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
        {items.length === 0 ? (
          <li>No items available yet.</li>
        ) : (
          items.map((item) => <li key={item}>{item}</li>)
        )}
      </ul>
    </section>
  );
}
