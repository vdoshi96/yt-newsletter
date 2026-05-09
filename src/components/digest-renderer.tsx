import type { DailyDigestPayload } from "@/lib/digests/schemas";

export function DigestRenderer({ digest }: { digest: DailyDigestPayload }) {
  return (
    <article className="newspaper-sheet">
      <header className="border-b-4 border-double border-stone-900 pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-stone-500">
          Daily creator edition
        </p>
        <h1 className="mt-3 max-w-4xl font-serif text-4xl font-black leading-tight text-stone-950 md:text-6xl">
          {digest.title}
        </h1>
        <p className="mt-3 max-w-3xl text-lg text-stone-700">{digest.dek}</p>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section>
          <h2 className="section-kicker">Front Page</h2>
          <p className="newspaper-lede">{digest.front_page_summary}</p>
        </section>
        <aside className="ink-panel">
          <h2 className="section-kicker">Skepticism / Uncertainty</h2>
          <p className="text-sm leading-6 text-stone-700">{digest.skepticism_notes}</p>
        </aside>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <DigestSection title="What the creator said" items={digest.what_creator_said} />
        <DigestSection title="What to do next" items={digest.what_to_do_next} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr_0.85fr]">
        <section className="article-column">
          <h2>Plain-English explanation</h2>
          <p>{digest.plain_english_explanation}</p>
        </section>
        <section className="article-column">
          <h2>Why this matters</h2>
          <p>{digest.why_it_matters}</p>
        </section>
        <section className="article-column">
          <h2>Follow-up from yesterday</h2>
          <p>{digest.follow_up_from_yesterday}</p>
        </section>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <section className="ink-panel">
          <h2 className="section-kicker">Terms to understand</h2>
          <dl className="space-y-3">
            {digest.glossary.length === 0 ? (
              <p className="text-sm text-stone-600">No glossary terms were extracted yet.</p>
            ) : (
              digest.glossary.map((term) => (
                <div key={term.term}>
                  <dt className="font-bold text-stone-950">{term.term}</dt>
                  <dd className="text-sm leading-6 text-stone-700">{term.definition}</dd>
                </div>
              ))
            )}
          </dl>
        </section>
        <DigestSection title="Free learning path" items={digest.free_learning_plan} />
        <section className="ink-panel">
          <h2 className="section-kicker">Source / timestamp notes</h2>
          <ul className="space-y-3 text-sm leading-6 text-stone-700">
            {digest.source_notes.length === 0 ? (
              <li>No timestamped source notes available.</li>
            ) : (
              digest.source_notes.map((note, index) => (
                <li key={`${note.timestamp ?? "note"}-${index}`}>
                  <strong>{note.timestamp ?? "Source note"}:</strong> {note.note}
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </article>
  );
}

function DigestSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="ink-panel">
      <h2 className="section-kicker">{title}</h2>
      <ul className="space-y-3 text-sm leading-6 text-stone-700">
        {items.length === 0 ? (
          <li>No items available yet.</li>
        ) : (
          items.map((item) => <li key={item}>{item}</li>)
        )}
      </ul>
    </section>
  );
}
