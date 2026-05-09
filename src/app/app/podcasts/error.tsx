"use client";

export default function PodcastsError({ reset }: { reset: () => void }) {
  return (
    <section className="ink-panel">
      <p className="section-kicker">Error</p>
      <h2 className="mt-3 font-serif text-3xl font-black">Podcast could not load</h2>
      <button className="btn-primary mt-5" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
