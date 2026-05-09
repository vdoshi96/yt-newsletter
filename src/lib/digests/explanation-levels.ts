export const EXPLANATION_LEVEL_KEYS = ["beginner", "intermediate", "advanced"] as const;

export type ExplanationLevel = (typeof EXPLANATION_LEVEL_KEYS)[number];

export type ExplanationLevels = Record<ExplanationLevel, string>;

export const EXPLANATION_LEVEL_LABELS: Record<ExplanationLevel, string> = {
  beginner: "Level 1: Beginner CS Background",
  intermediate: "Level 2: Intermediate CS Background",
  advanced: "Level 3: Advanced CS / AI Systems Background",
};

export function normalizeExplanationLevels(
  levels: Partial<ExplanationLevels> | null | undefined,
  fallback: string,
): ExplanationLevels {
  const hasSharedPlainEnglish = fallback.trim().length > 0;
  const regenerationHint = hasSharedPlainEnglish
    ? "The shared Plain English Explanation remains separate; regenerate this digest from a verified transcript to restore this level."
    : "Regenerate this digest from a verified transcript to restore this level.";
  const hasLevelText =
    levels?.beginner?.trim() || levels?.intermediate?.trim() || levels?.advanced?.trim();
  if (!hasLevelText) {
    return {
      beginner: `Level 1 explanation unavailable. ${regenerationHint}`,
      intermediate: `Level 2 explanation unavailable. ${regenerationHint}`,
      advanced: `Level 3 explanation unavailable. ${regenerationHint}`,
    };
  }
  return {
    beginner:
      levels?.beginner?.trim() ||
      `Level 1 explanation unavailable. ${regenerationHint}`,
    intermediate:
      levels?.intermediate?.trim() ||
      `Level 2 explanation unavailable. ${regenerationHint}`,
    advanced:
      levels?.advanced?.trim() ||
      `Level 3 explanation unavailable. ${regenerationHint}`,
  };
}
