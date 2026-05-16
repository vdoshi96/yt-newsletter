Create a long-form "This Week in AI" digest for one YouTube creator covering the previous weekend plus Monday through Friday of the same week.

Return JSON only. Do not include Markdown fences.

Use only the supplied cached daily digests, transcript-grounding notes, exact quote anchors, and any supplied date-scoped research notes. Do not invent videos, claims, sources, dates, quotes, market facts, or investment conclusions.

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

Editorial shape:
- Make this feel like a weekly newspaper section, not a concatenation or shorter recap of daily digests.
- Synthesize major themes, recurring concepts, important updates, practical takeaways, and unresolved questions across the week.
- Treat the weekly edition as a DeepSeek research-style deep dive over the supplied daily digests: explain the underlying technical concepts, adjacent product, market, governance, and operational ideas, and the practical implications that are directly supported by the source material.
- Adjacent-topic analysis is allowed only as bounded interpretation from the supplied daily digests, transcript-grounding notes, quote anchors, and date-scoped research notes. Do not introduce unsupplied news, company facts, prices, benchmarks, or market claims.
- Keep the JSON complete and parseable. Dense, source-bounded synthesis is better than very long prose that risks truncation.
- Target lengths: `newsletter_markdown` 900-1400 words; each explanation level 180-300 words; `executive_insights_memo` 180-300 words; `market_investment_lens` 250-450 words; each research brief field 1-3 concise paragraphs or bullets.
- Cover about 10 AI posts for the week: videos, guides, how-to items, research notes, market items, and practical exercises. If there are fewer than 10 source-backed items, create learning-oriented posts from the supplied sources and explicitly mark the limitation.
- Include a board-level executive insights memo focused on AI strategy, markets, infrastructure, investments, budget risk, and adoption risk.
- `market_investment_lens` must be meaningfully elaborated, usually 2-4 substantive paragraphs when the sources support it. Explain broader market, ecosystem, product, funding, company, infrastructure, or industry implications without filler.
- Include deeper research briefs on the most important topics for the week. Each research brief needs context, background, why it matters, practical interpretation, evidence, implications, and uncertainty. Avoid two-line briefs.
- Research briefs should read like mini deep dives. Define the concept, connect it to the week's grounded examples, describe adjacent concepts a learner should understand, and separate evidence from inference.
- The weekly digest can be substantially longer than a daily digest.
- Do not write the final podcast script in the weekly JSON; the app builds the 30-minute two-host production from the grounded weekly payload.

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
- For source notes tied to daily digests, set `label` to `Daily digest: <exact Title from SOURCE DIGESTS>`.
- Do not recommend paid courses unless clearly marked optional.
- If date-scoped external research notes are not supplied, say the external research layer is unavailable and keep market/investment claims conservative.
- The podcast script should sound conversational and cautious, with two hosts discussing the week like a smart markets-and-AI show rather than reading bullets.
