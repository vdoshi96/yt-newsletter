import { z } from "zod";
import {
  EXPLANATION_LEVEL_KEYS,
  normalizeExplanationLevels,
} from "./explanation-levels";
import {
  cleanNewsletterMarkdownArtifacts,
  cleanSkepticismNote,
} from "./text-cleanup";

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
  timestamp: z.string().nullish(),
  quote: z.string().optional(),
  note: z.string().min(1),
});

const conceptsToLearnSchema = z.object({
  beginner: z.array(z.string().min(1)).default([]),
  intermediate: z.array(z.string().min(1)).default([]),
  advanced: z.array(z.string().min(1)).default([]),
});

const transcriptGroundingSchema = z.object({
  transcript_source: z.string().min(1),
  transcript_length: z.number().int().nonnegative(),
  video_id: z.string().min(1),
  transcript_id: z.string().min(1).optional(),
  transcript_recorded_at: z.string().min(1).optional(),
  generation_timestamp: z.string().min(1),
  generation_model: z.string().min(1).optional(),
  regenerated_after_hallucination_fix: z.boolean().optional(),
  key_excerpts: z
    .array(
      z.object({
        timestamp: z.string().nullish(),
        quote: z.string().min(1),
        note: z.string().min(1),
      }),
    )
    .default([]),
});

const weeklySourceNoteSchema = z.object({
  date: z.string().min(1),
  label: z.string().min(1),
  url: z.string().url().or(z.string().min(1)).optional(),
  note: z.string().min(1),
});

const weeklyPostSchema = z.object({
  date: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  why_it_matters: z.string().min(1),
  source_url: z.string().url().or(z.string().min(1)).optional(),
});

const researchBriefSchema = z.object({
  title: z.string().min(1),
  thesis: z.string().min(1),
  evidence: z.array(z.string()).default([]),
  implications: z.array(z.string()).default([]),
  uncertainty: z.string().min(1),
});

const explanationLevelsSchema = z.object(
  Object.fromEntries(EXPLANATION_LEVEL_KEYS.map((level) => [level, z.string().min(1)])) as Record<
    (typeof EXPLANATION_LEVEL_KEYS)[number],
    z.ZodString
  >,
);

const defaultedString = (fallback: string) =>
  z.preprocess((value) => (value === null || value === undefined ? fallback : value), z.string());

const importanceScoreSchema = z.preprocess((value) => {
  if (typeof value !== "number") return value;
  if (value > 1 && value <= 100) return value / 100;
  return value;
}, z.number().min(0).max(1));

export const dailyDigestSchema = z
  .object({
    layout_type: layoutTypeSchema,
    title: z.string().min(1),
    dek: z.string().min(1),
    front_page_summary: z.string().min(1),
    what_creator_said: z.array(z.string()).default([]),
    plain_english_explanation: z.string().min(1),
    explanation_levels: explanationLevelsSchema.optional(),
    why_it_matters: z.string().min(1),
    what_to_do_next: z.array(z.string()).default([]),
    free_learning_plan: z.array(z.string()).default([]),
    glossary: z.array(glossarySchema).default([]),
    topic_links: z.array(linkSchema).default([]),
    skepticism_notes: z.string().min(1),
    source_notes: z.array(sourceNoteSchema).default([]),
    concepts_to_learn: conceptsToLearnSchema.default({
      beginner: [],
      intermediate: [],
      advanced: [],
    }),
    transcript_grounding: transcriptGroundingSchema
      .default({
        transcript_source: "legacy_digest_unverified",
        transcript_length: 0,
        video_id: "unknown",
        generation_timestamp: "unknown",
        key_excerpts: [],
      }),
    follow_up_from_yesterday: defaultedString("No prior digest available."),
  })
  .transform((digest) => ({
    ...digest,
    skepticism_notes: cleanSkepticismNote(digest.skepticism_notes),
    explanation_levels: normalizeExplanationLevels(
      digest.explanation_levels,
      digest.plain_english_explanation,
    ),
  }));

export type DailyDigestPayload = z.infer<typeof dailyDigestSchema>;

export const weeklyDigestSchema = z
  .object({
    title: z.string().min(1),
    newsletter_markdown: z.string().min(1),
    explanation_levels: explanationLevelsSchema.optional(),
    executive_insights_memo: z.string().default("No executive memo is available yet."),
    board_level_implications: z.array(z.string()).default([]),
    market_investment_lens: z.string().default("No market or investment lens is available yet."),
    weekly_posts: z.array(weeklyPostSchema).default([]),
    research_briefs: z.array(researchBriefSchema).default([]),
    source_notes: z.array(weeklySourceNoteSchema).default([]),
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
  })
  .transform((digest) => ({
    ...digest,
    newsletter_markdown: cleanNewsletterMarkdownArtifacts(digest.newsletter_markdown),
    explanation_levels: normalizeExplanationLevels(
      digest.explanation_levels,
      digest.newsletter_markdown,
    ),
  }));

export type WeeklyDigestPayload = z.infer<typeof weeklyDigestSchema>;
