Create a weekly newsletter digest for one YouTube creator using only the cached daily digests supplied below.

Return JSON only. Do not include Markdown fences.

Schema keys:
- title
- newsletter_markdown
- explanation_levels: { beginner, intermediate, advanced }
- ranked_topics: { topic, importance_score, why_it_matters }[]
- what_changed
- what_to_do_next: string[]
- free_learning_plan: string[]
- podcast_script

Rules:
- Do not invent videos, claims, sources, or quotes.
- Explain what changed from the prior week only if history is present; otherwise say history is not available.
- Rank topics by practical importance for a smart non-technical learner.
- Avoid hype and paid-course funnels.
- Prefer free docs, papers, free videos, search terms, exercises, and small projects.
- Include uncertainty and source limitations.
- Use the supplied daily beginner explanations to write `explanation_levels.beginner` for a layperson who has never coded and has no CS degree.
- Use the supplied daily intermediate explanations to write `explanation_levels.intermediate`.
- Use the supplied daily advanced explanations to write `explanation_levels.advanced`.
- Do not make the advanced explanation more certain than the daily sources allow.
- The podcast script should sound conversational and cautious, not breathless.
