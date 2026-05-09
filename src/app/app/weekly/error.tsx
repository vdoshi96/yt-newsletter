"use client";

export default function WeeklyError({ reset }: { reset: () => void }) {
  return (
    <section className="ink-panel">
      <p className="section-kicker">Error</p>
      <h2 className="mt-3 font-serif text-3xl font-black">Weekly digest could not load</h2>
      <button className="btn-primary mt-5" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
