export const EXPLANATION_LEVEL_KEYS = ["beginner", "intermediate", "advanced"] as const;

export type ExplanationLevel = (typeof EXPLANATION_LEVEL_KEYS)[number];

export type ExplanationLevels = Record<ExplanationLevel, string>;

export const EXPLANATION_LEVEL_LABELS: Record<ExplanationLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Expert",
};

export function normalizeExplanationLevels(
  levels: Partial<ExplanationLevels> | null | undefined,
  fallback: string,
): ExplanationLevels {
  const safeFallback = fallback.trim() || "No explanation is available yet.";
  return {
    beginner: levels?.beginner?.trim() || safeFallback,
    intermediate: levels?.intermediate?.trim() || levels?.beginner?.trim() || safeFallback,
    advanced:
      levels?.advanced?.trim() ||
      levels?.intermediate?.trim() ||
      levels?.beginner?.trim() ||
      safeFallback,
  };
}
