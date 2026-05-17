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
          <h2 className="section-kicker">TL;DR</h2>
          <p className="newspaper-lede">{digest.front_page_summary}</p>
        </section>
        <aside className="rounded-lg border border-amber-300 bg-amber-50/60 p-5">
          <h2 className="text-base font-black text-amber-800">Skepticism / uncertainty</h2>
          <p className="mt-3 text-sm leading-6 text-slate-700">{digest.skepticism_notes}</p>
        </aside>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <DigestSection title="What the creator said" items={digest.what_creator_said} />
        <DigestSection title="Actionable takeaways" items={digest.what_to_do_next} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="article-column">
          <h2>Plain English Explanation</h2>
          <div className="space-y-3">{renderProseParagraphs(digest.plain_english_explanation)}</div>
        </section>
        <section className="article-column">
          <h2>Why this matters</h2>
          <div className="space-y-3">{renderProseParagraphs(digest.why_it_matters)}</div>
        </section>
      </div>

      <div className="mt-8">
        <ExplanationLevelPanel
          title="Full Digest By CS / AI Proficiency"
          levels={digest.full_level_versions}
        />
      </div>

      <div className="mt-8">
        <section className="article-column">
          <h2>Follow-up from yesterday</h2>
          <div className="space-y-3">{renderProseParagraphs(digest.follow_up_from_yesterday)}</div>
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

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <ConceptsToLearn digest={digest} />
        <TranscriptGrounding digest={digest} />
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

function ConceptsToLearn({ digest }: { digest: DailyDigestPayload }) {
  const groups = [
    ["Beginner", digest.concepts_to_learn.beginner],
    ["Intermediate", digest.concepts_to_learn.intermediate],
    ["Advanced", digest.concepts_to_learn.advanced],
  ] as const;

  return (
    <section className="ink-panel">
      <h2 className="section-kicker">Concepts to learn</h2>
      <div className="mt-3 space-y-4">
        {groups.map(([label, concepts]) => (
          <div key={label}>
            <h3 className="text-sm font-black text-slate-950">{label}</h3>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
              {concepts.length ? (
                concepts.map((concept) => <li key={`${label}-${concept}`}>{concept}</li>)
              ) : (
                <li>No concepts listed yet.</li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function TranscriptGrounding({ digest }: { digest: DailyDigestPayload }) {
  const grounding = digest.transcript_grounding;
  const isGrounded =
    grounding.transcript_source === "youtube_transcript_free" &&
    grounding.transcript_length > 0 &&
    grounding.generation_timestamp !== "unknown";

  return (
    <section
      className={`ink-panel ${
        isGrounded ? "border-emerald-200 bg-emerald-50/30" : "border-amber-300 bg-amber-50/60"
      }`}
    >
      <h2 className="section-kicker">Transcript grounding</h2>
      <dl className="mt-3 grid gap-3 text-sm leading-6 text-slate-600">
        <div>
          <dt className="font-bold text-slate-950">Grounding status</dt>
          <dd>{isGrounded ? "Grounded in verified transcript" : "Needs regeneration"}</dd>
        </div>
        <div>
          <dt className="font-bold text-slate-950">Transcript source</dt>
          <dd>{grounding.transcript_source}</dd>
        </div>
        {grounding.generation_model ? (
          <div>
            <dt className="font-bold text-slate-950">Model used</dt>
            <dd>{grounding.generation_model}</dd>
          </div>
        ) : null}
      </dl>
    </section>
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
  if (cleaned.length <= 520) return cleaned ? [cleaned] : [];

  const sentences = cleaned.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [cleaned];
  const paragraphs: string[] = [];
  let current = "";
  for (const sentence of sentences.map((item) => item.trim()).filter(Boolean)) {
    if (!current) {
      current = sentence;
    } else if (`${current} ${sentence}`.length <= 520) {
      current = `${current} ${sentence}`;
    } else {
      paragraphs.push(current);
      current = sentence;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}
