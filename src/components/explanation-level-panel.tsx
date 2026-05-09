"use client";

import { useId, useState } from "react";
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
  const selectId = useId();
  const [selected, setSelected] = useState<ExplanationLevel>("beginner");

  return (
    <section className={className ?? "article-column"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h2>{title}</h2>
        <label className="text-xs font-bold uppercase tracking-[0.18em] text-stone-500">
          Level
          <select
            id={selectId}
            className="mt-2 h-10 w-full rounded border border-stone-300 bg-white px-3 text-sm normal-case tracking-normal text-stone-950 sm:w-44"
            value={selected}
            onChange={(event) => setSelected(event.target.value as ExplanationLevel)}
          >
            {EXPLANATION_LEVEL_KEYS.map((level) => (
              <option key={level} value={level}>
                {EXPLANATION_LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-4">{levels[selected]}</p>
    </section>
  );
}
