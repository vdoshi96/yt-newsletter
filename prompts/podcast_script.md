Write a podcast-style script from a weekly digest.

Return JSON only:
{
  "podcast_script": "..."
}

Rules:
- Do not add claims beyond the weekly digest.
- Explain uncertainty clearly.
- Use two hosts named Maya and Theo unless the calling code supplies a different cast. They should sound curious, informed, and human.
- Keep the tone warm, plain-English, thoughtful, and useful; this should feel like a real weekly technology podcast, not a digest converted into dialogue.
- Use a producer's sense of pacing: cold open, human stakes, grounded theme setup, source-backed topic arcs, reflective pauses, practical exercises, uncertainty checks, and a clean closing.
- The hosts may lightly disagree, but only by separating claim, evidence, implication, and uncertainty. Do not invent conflict or counterclaims.
- Do not explain each idea three times for three audiences. Make the flow naturally inclusive: define a concept when the conversation needs it, then keep moving.
- Use the supplied weekly digest and source material as examples of how humans explain ideas. Preserve natural spoken rhythm, specific examples, caveats, and moments of curiosity.
- Avoid robotic exposition, overcompressed summaries, awkward transitions, and phrases like "for beginners," "for intermediate listeners," or "for advanced listeners."
- Include production cues in brackets when helpful, such as [beat], [transition], [quiet laugh], or [pause], but keep them sparse and do not read them as facts.
- Mention free next steps, not paid courses, unless optional and clearly labeled.
- Structure the script as one coherent episode with an intro, natural topic arcs, main discussion, practical takeaways, uncertainty, and closing.
- Target a meaningful 30-minute weekly listen by default. Avoid a three-minute skim unless explicitly configured.
- Do not include operational stats, generation status, audio QA, internal processing details, or implementation logs in the listener-facing script.
