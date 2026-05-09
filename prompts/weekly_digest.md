Create a long-form "This Week in AI" digest for one YouTube creator.

Return JSON only. Do not include Markdown fences.

Use only the supplied cached daily digests and any supplied date-scoped research notes. Do not invent videos, claims, sources, dates, quotes, market facts, or investment conclusions.

Schema keys:
- title
- newsletter_markdown
- explanation_levels: { beginner, intermediate, advanced }
- executive_insights_memo
- board_level_implications: string[]
- market_investment_lens
- weekly_posts: { date, type, title, summary, why_it_matters, source_url? }[]
- research_briefs: { title, thesis, evidence, implications, uncertainty }[]
- source_notes: { date, label, url?, note }[]
- ranked_topics: { topic, importance_score, why_it_matters }[]
- what_changed
- what_to_do_next: string[]
- free_learning_plan: string[]
- podcast_script

Editorial shape:
- Make this feel like a weekly newspaper section, not a shorter recap of daily digests.
- Cover about 10 AI posts for the week: videos, guides, how-to items, research notes, market items, and practical exercises. If there are fewer than 10 source-backed items, create learning-oriented posts from the supplied sources and explicitly mark the limitation.
- Include a board-level executive insights memo focused on AI strategy, markets, infrastructure, investments, budget risk, and adoption risk.
- `market_investment_lens` must be meaningfully elaborated, usually 2-4 substantive paragraphs when the sources support it. Explain broader market, ecosystem, product, funding, company, infrastructure, or industry implications without filler.
- Include deeper research briefs on the most important topics for the week. Each research brief needs context, background, why it matters, practical interpretation, evidence, implications, and uncertainty. Avoid two-line briefs.
- The weekly digest can be substantially longer than a daily digest.
- `podcast_script` should be a long-form two-host script with intro, topic transitions, main discussion, practical takeaways, uncertainty caveats, and closing. Target a meaningful listen rather than a three-minute skim.

Explanation levels:
- `explanation_levels.beginner` must be written for a layperson who has never coded, has no CS degree, and needs plain-English foundations.
- `explanation_levels.intermediate` should assume vague familiarity with AI tools and connect ideas to workflows, evaluation, cost, cause/effect, and practical adoption.
- `explanation_levels.advanced` must be visibly deeper than intermediate and can discuss architecture, market structure, model limitations, deployment tradeoffs, and investment implications, but must not be more certain than the sources allow.
- Pull the weekly explanation levels from the corresponding daily explanation levels when available.

Rules:
- Rank topics by practical importance for a smart non-technical learner and an executive reader.
- Avoid hype and paid-course funnels.
- Prefer free docs, papers, free videos, search terms, exercises, and small projects.
- Mark uncertainty and source limitations clearly.
- Use dates in source notes.
- Do not recommend paid courses unless clearly marked optional.
- If date-scoped external research notes are not supplied, say the external research layer is unavailable and keep market/investment claims conservative.
- The podcast script should sound conversational and cautious, with two hosts discussing the week like a smart markets-and-AI show rather than reading bullets.
