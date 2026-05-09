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
        <h2>{title}</h2>
        <div className="grid grid-cols-3 overflow-hidden rounded border border-stone-300 bg-white text-xs font-black uppercase text-stone-700">
          {EXPLANATION_LEVEL_KEYS.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={selected === level}
              className={
                selected === level
                  ? "bg-stone-900 px-2 py-2 text-white"
                  : "px-2 py-2 hover:bg-stone-100"
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
