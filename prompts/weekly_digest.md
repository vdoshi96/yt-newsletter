Create a long-form "This Week in AI" digest for one YouTube creator covering a completed Saturday-through-Friday week.

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
- Make this feel like a deeply reported technology newspaper feature, closer to a serious publication than a bullet-point AI summary.
- Do not merely regurgitate daily digests. Synthesize across the week, explain what was under-explained, add missing context from supplied date-scoped research notes, connect related technologies and companies when the supplied notes support it, and make clear why the week mattered.
- Each major section must add distinct value. Avoid repeating the same "uncertainty plus TL;DR" point in multiple places. If two sections would say the same thing, merge them or make one more analytical.
- Treat the weekly edition as a research-style deep dive over the supplied daily digests: explain underlying technical concepts, adjacent product, market, governance, and operational ideas, and the practical implications that are directly supported by the source material.
- Adjacent-topic analysis is allowed only as bounded interpretation from the supplied daily digests, transcript-grounding notes, quote anchors, and date-scoped research notes. Do not introduce unsupplied news, company facts, prices, benchmarks, or market claims.
- When reputable external research notes are supplied, cite or ground the claims through `research_briefs` and `source_notes`. If they are not supplied, say the external research layer is unavailable and keep broader claims conservative.
- Keep the JSON complete and parseable. Dense, source-bounded synthesis is better than very long prose that risks truncation.
- Target lengths: `newsletter_markdown` 1200-1800 words; each explanation level 220-380 words; `executive_insights_memo` 220-380 words; `market_investment_lens` 300-550 words; each research brief field 1-3 substantive paragraphs or precise bullets.
- `weekly_posts` is only an internal source index. Keep it compact and source-bounded; do not spend the main editorial energy on a clickable list of posts.
- Include a board-level executive insights memo focused on AI strategy, markets, infrastructure, investments, budget risk, and adoption risk.
- `market_investment_lens` must be meaningfully elaborated, usually 2-4 substantive paragraphs when the sources support it. Explain broader market, ecosystem, product, funding, company, infrastructure, or industry implications without filler.
- Include deeper research briefs on the most important topics for the week. Each research brief needs context, background, why it matters, practical interpretation, evidence, implications, and uncertainty. Avoid two-line briefs.
- Research briefs should read like mini deep dives. Define the concept, connect it to the week's grounded examples, describe adjacent concepts a learner should understand, and separate evidence from inference.
- The weekly digest can be substantially longer than a daily digest.
- Keep the weekly JSON focused on the reader-facing digest fields above. Do not add side products, scripts, or media-production fields.

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
- `source_notes` are internal grounding aids. Use dates, but keep them terse; do not create a user-facing "grounded source notes" essay.
- For source notes tied to daily digests, set `label` to `Daily digest: <exact Title from SOURCE DIGESTS>`.
- Do not recommend paid courses unless clearly marked optional.
- If date-scoped external research notes are not supplied, say the external research layer is unavailable and keep market/investment claims conservative.
