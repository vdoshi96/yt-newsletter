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
      <div className="mt-4 space-y-3">{renderProseParagraphs(levels[selected])}</div>
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
