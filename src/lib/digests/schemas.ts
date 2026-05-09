import { z } from "zod";

export const layoutTypeSchema = z.enum([
  "single_big_story",
  "two_lead_stories",
  "concept_explainer",
  "release_digest",
  "timeline_heavy",
  "controversy_or_debate",
]);

const linkSchema = z.object({
  label: z.string().min(1),
  url: z.string().url().or(z.string().min(1)),
});

const glossarySchema = z.object({
  term: z.string().min(1),
  definition: z.string().min(1),
});

const sourceNoteSchema = z.object({
  timestamp: z.string().optional(),
  quote: z.string().optional(),
  note: z.string().min(1),
});

const defaultedString = (fallback: string) =>
  z.preprocess((value) => (value === null || value === undefined ? fallback : value), z.string());

const importanceScoreSchema = z.preprocess((value) => {
  if (typeof value !== "number") return value;
  if (value > 1 && value <= 100) return value / 100;
  return value;
}, z.number().min(0).max(1));

export const dailyDigestSchema = z.object({
  layout_type: layoutTypeSchema,
  title: z.string().min(1),
  dek: z.string().min(1),
  front_page_summary: z.string().min(1),
  what_creator_said: z.array(z.string()).default([]),
  plain_english_explanation: z.string().min(1),
  why_it_matters: z.string().min(1),
  what_to_do_next: z.array(z.string()).default([]),
  free_learning_plan: z.array(z.string()).default([]),
  glossary: z.array(glossarySchema).default([]),
  topic_links: z.array(linkSchema).default([]),
  skepticism_notes: z.string().min(1),
  source_notes: z.array(sourceNoteSchema).default([]),
  follow_up_from_yesterday: defaultedString("No prior digest available."),
});

export type DailyDigestPayload = z.infer<typeof dailyDigestSchema>;

export const weeklyDigestSchema = z.object({
  title: z.string().min(1),
  newsletter_markdown: z.string().min(1),
  ranked_topics: z
    .array(
      z.object({
        topic: z.string().min(1),
        importance_score: importanceScoreSchema,
        why_it_matters: z.string().min(1),
      }),
    )
    .default([]),
  what_changed: z.string().min(1),
  what_to_do_next: z.array(z.string()).default([]),
  free_learning_plan: z.array(z.string()).default([]),
  podcast_script: z.string().min(1),
});

export type WeeklyDigestPayload = z.infer<typeof weeklyDigestSchema>;
