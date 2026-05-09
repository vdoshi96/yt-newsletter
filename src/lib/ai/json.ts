export function parseJsonFromModel<T>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
  return JSON.parse(candidate) as T;
}

export function localDigestFallback(input: {
  title: string;
  transcriptOrNotes: string;
  transcriptSource: string;
}) {
  const excerpt = input.transcriptOrNotes.slice(0, 1400).trim();
  return {
    layout_type: "concept_explainer",
    title: input.title,
    dek: "A cautious plain-English digest generated from the available source text.",
    front_page_summary: excerpt || "No transcript text was available for this video.",
    what_creator_said: excerpt ? [excerpt.slice(0, 400)] : [],
    plain_english_explanation:
      "The app could not reach a configured AI provider, so this fallback avoids adding claims beyond the stored transcript or notes.",
    why_it_matters:
      "This keeps the dashboard useful without inventing details. Regenerate after API credentials are configured for a richer explanation.",
    what_to_do_next: [
      "Read the source notes first.",
      "Search the exact terms from the creator's own wording.",
      "Prefer free docs, papers, and hands-on mini-projects before paid courses.",
    ],
    free_learning_plan: [
      "Write down three unfamiliar terms from the video.",
      "Search the official documentation or a free explainer for each term.",
      "Build a tiny example or checklist that uses one idea from the video.",
    ],
    glossary: [],
    topic_links: [],
    skepticism_notes: `Source type: ${input.transcriptSource}. This fallback does not infer unsupported facts.`,
    source_notes: [],
    follow_up_from_yesterday: "No prior digest available.",
  };
}
