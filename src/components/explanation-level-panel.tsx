"use client";

import { useState } from "react";
import {
  EXPLANATION_LEVEL_KEYS,
  EXPLANATION_LEVEL_LABELS,
  type ExplanationLevel,
  type ExplanationLevels,
} from "@/lib/digests/explanation-levels";

export function ExplanationLevelPanel({
  levels,
  title,
  className,
}: {
  levels: ExplanationLevels;
  title: string;
  className?: string;
}) {
  const [selected, setSelected] = useState<ExplanationLevel>("beginner");

  return (
    <section className={className ?? "article-column"}>
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
        <div className="grid gap-1 rounded-md border border-slate-300 bg-white p-1 text-xs font-bold text-slate-700 md:grid-cols-3">
          {EXPLANATION_LEVEL_KEYS.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={selected === level}
              className={
                selected === level
                  ? "rounded bg-blue-600 px-2 py-2.5 text-white"
                  : "rounded px-2 py-2.5 hover:bg-slate-50"
              }
              onClick={() => setSelected(level)}
            >
              {EXPLANATION_LEVEL_LABELS[level]}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-4">{levels[selected]}</p>
    </section>
  );
}
