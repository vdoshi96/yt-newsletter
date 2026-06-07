import "./load-env";
import { closeSql, getSql } from "@/lib/db";
import { weeklyDigestSchema } from "@/lib/digests/schemas";
import { normalizeExplanationLevels } from "@/lib/digests/explanation-levels";
import {
  VERIFIED_TRANSCRIPT_SOURCES,
  minimumTranscriptCharacters,
} from "@/lib/digests/grounding";
import { buildWeeklySourceReferences } from "@/lib/weekly/source-text";

type DailyRow = {
  video_id?: string | null;
  transcript_id?: string | null;
  transcript_source?: string | null;
  transcript_length?: number | null;
  digest_date: string;
  title: string;
  front_page_summary: string;
  plain_english_explanation: string;
  why_it_matters: string;
  full_digest_json: unknown;
};

type WeeklyRow = {
  id: string;
  creator_id: string;
  week_start: string;
  week_end: string;
};

type ResearchSource = {
  date: string;
  label: string;
  url: string;
  note: string;
  type: "research" | "market memo" | "guide" | "policy" | "security";
};

type ResearchBrief = {
  title: string;
  thesis: string;
  evidence: string[];
  implications: string[];
  uncertainty: string;
};

type WeeklyConfig = {
  title: string;
  executiveMemo: string;
  boardImplications: string[];
  marketLens: string;
  whatChanged: string;
  topics: Array<{ topic: string; importance_score: number; why_it_matters: string }>;
  researchBriefs: ResearchBrief[];
  sources: ResearchSource[];
  learningPlan: string[];
  actions: string[];
};

const weeklyResearch: Record<string, WeeklyConfig> = {
  "2026-04-12": {
    title: "This Week in AI: Agents Need Checks, Distribution Matters, Design Moves Into Workflows",
    executiveMemo:
      "This week was less about a single dazzling model demo and more about operating discipline. Nate B. Jones's videos kept returning to the same practical question: if agents, faster models, and self-improving loops are real, where do the gains actually appear in a business? The external research layer points to the answer: distribution, governance, and repeatable implementation are becoming as important as raw model capability. OpenAI's enterprise push through AWS signaled that model providers want to meet customers inside existing cloud procurement paths, while Anthropic's Claude Design showed AI moving from chat into structured creative workflows. For boards, the core question is no longer 'Should we use AI?' It is 'Which workflows deserve automation, which outputs need human review, and how will we measure value without mistaking demos for durable systems?'",
    boardImplications: [
      "Require every agent project to name its human owner, approval boundary, and failure recovery path before production use.",
      "Treat cloud distribution and procurement flexibility as strategic, because AI tools increasingly arrive through AWS, Azure, Google Cloud, and enterprise software channels.",
      "Measure throughput and quality together; a 50x faster component can still create only a 2x business gain when surrounding handoffs are slow.",
      "Ask whether design, prototyping, and internal communication workflows can be improved with AI before funding broader headcount-replacement claims.",
    ],
    marketLens:
      "The investable signal was enterprise routing, not consumer novelty. Cloud partnerships, design workflow products, and early agent infrastructure all suggest that AI economics depend on repeat usage inside existing business systems. That makes systems integrators, cloud commitments, security controls, and workflow software more important than model benchmarks alone.",
    whatChanged:
      "The week reframed agents from magic assistants into managed systems. The practical frontier shifted toward verification loops, clear workflow ownership, and deployment channels that can reach real customers.",
    topics: [
      {
        topic: "Agent reliability",
        importance_score: 0.95,
        why_it_matters:
          "The videos and research both point to verification as the difference between a demo and a useful agent.",
      },
      {
        topic: "Enterprise distribution",
        importance_score: 0.88,
        why_it_matters:
          "OpenAI's AWS push shows that customers want AI inside the cloud and procurement systems they already use.",
      },
      {
        topic: "AI-assisted design work",
        importance_score: 0.78,
        why_it_matters:
          "Claude Design is an example of AI becoming a workflow surface for non-programmers, not only a chat box.",
      },
      {
        topic: "Self-improving loops",
        importance_score: 0.74,
        why_it_matters:
          "The Karpathy-loop theme is powerful, but it needs evaluation gates so overnight improvement does not become overnight drift.",
      },
    ],
    researchBriefs: [
      {
        title: "Agent gains are bottlenecked by the surrounding process",
        thesis:
          "Faster model calls do not automatically create equivalent business speedups because approval, context gathering, integration, and review still dominate many workflows.",
        evidence: [
          "Daily digest on AI speedups versus business throughput",
          "Daily digest on agents needing better problem framing",
          "OpenAI enterprise distribution reporting from April 13, 2026",
        ],
        implications: [
          "Boards should fund workflow measurement before broad automation claims.",
          "Teams need clear before-and-after metrics: cycle time, error rate, rework, customer response time, and escalation count.",
        ],
        uncertainty:
          "The stored daily digests are based on one creator's selected topics, so they are useful signals but not a full market survey.",
      },
      {
        title: "Design automation is becoming part of the operating stack",
        thesis:
          "Claude Design suggests a shift from AI as text generation toward AI as a collaborative production environment for prototypes, decks, and product handoff.",
        evidence: [
          "Anthropic Claude Design announcement dated April 17, 2026",
          "Daily digest coverage of agent loops and workflow speed",
        ],
        implications: [
          "Non-technical teams can test ideas sooner, but brand governance and review still matter.",
          "Product and marketing leaders should pilot AI design tools on low-risk internal assets before customer-facing material.",
        ],
        uncertainty:
          "Preview products can change quickly, and vendor examples may overstate typical results.",
      },
    ],
    sources: [
      {
        date: "2026-04-13",
        label: "Axios on OpenAI, AWS, and enterprise distribution",
        url: "https://www.axios.com/2026/04/13/openai-microsoft-anthropic-amazon",
        note: "Used as context for why model providers are pushing into cloud channels customers already buy through.",
        type: "market memo",
      },
      {
        date: "2026-04-17",
        label: "Anthropic Claude Design announcement",
        url: "https://www.anthropic.com/news/claude-design-anthropic-labs",
        note: "Used as a product example of AI moving into design, prototype, and presentation workflows.",
        type: "guide",
      },
      {
        date: "2026-04-07",
        label: "Anthropic Project Glasswing",
        url: "https://www.anthropic.com/glasswing",
        note: "Used as background for the security governance theme around powerful coding and vulnerability-finding models.",
        type: "security",
      },
    ],
    learningPlan: [
      "Free: write a one-page checklist for an AI agent workflow that names the goal, input data, review point, and stop condition.",
      "Free: read an enterprise AI product announcement and underline where it discusses governance, deployment, and review instead of only capability.",
      "Free mini-project: time a recurring task, automate one step with a free tool, and measure the real end-to-end improvement.",
    ],
    actions: [
      "Pick one repeat workflow and define what a correct output looks like before using an AI agent on it.",
      "Create a small evaluation set of five examples where an agent should succeed and two where it should refuse or ask for help.",
      "For any design/prototype tool, require human review before customer-facing publication.",
    ],
  },
  "2026-04-19": {
    title: "This Week in AI: Labor Reality, Governance Pressure, and the Partner War",
    executiveMemo:
      "The week was a useful antidote to simple AI labor narratives. Nate's daily digests covered layoffs, job-market confusion, Claude product expansion, image generation, and a pair of non-AI explainers that still matter because learning discipline is becoming a career defense. The research layer showed why executives should be cautious: frontier labs are spending more in Washington, Google Cloud is funding a partner ecosystem to move agentic AI into enterprise deployments, and Mozilla's Firefox work made AI-assisted security feel concrete. The board-level takeaway is that AI adoption is now an operating model question: who implements it, who audits it, who bears the error risk, and how do workers reskill into the parts of the workflow that remain valuable?",
    boardImplications: [
      "Do not approve AI-driven layoffs without proof that the replacement workflow can handle exceptions, quality control, and accountability.",
      "Track policy exposure: copyright, cybersecurity, cloud infrastructure, and workforce issues are now lobbying priorities for frontier labs.",
      "Treat partner ecosystems as a market signal. Google Cloud's funding implies that many companies need external help moving from pilot to production.",
      "Invest in employee upskilling around AI review, prompt discipline, basic web literacy, and workflow mapping before assuming tool access is enough.",
    ],
    marketLens:
      "The market signal was services leverage. Google Cloud's partner fund, lab lobbying growth, and Mozilla's AI security result all point to a phase where value accrues to the companies that can implement, govern, and secure AI systems at scale. This favors platforms with partner ecosystems and security credibility, but the labor ROI remains uneven.",
    whatChanged:
      "AI moved from a talent-replacement story toward a governance-and-implementation story. The week made clear that cost savings, policy exposure, and security capability all need board attention.",
    topics: [
      {
        topic: "AI labor displacement and implementation gaps",
        importance_score: 0.96,
        why_it_matters:
          "Layoff narratives are easy; replacing work safely is harder and requires process evidence.",
      },
      {
        topic: "Partner-led enterprise AI",
        importance_score: 0.9,
        why_it_matters:
          "Google Cloud's partner fund shows that hyperscalers see deployment help as a bottleneck.",
      },
      {
        topic: "AI policy and lobbying",
        importance_score: 0.82,
        why_it_matters:
          "Regulatory exposure is becoming a normal operating concern for AI vendors and customers.",
      },
      {
        topic: "AI-assisted vulnerability discovery",
        importance_score: 0.78,
        why_it_matters:
          "Security teams may gain leverage, but they also inherit a larger triage workload.",
      },
    ],
    researchBriefs: [
      {
        title: "Layoff claims need workflow evidence",
        thesis:
          "The Block layoff video and job-market digest point to the same tension: AI can automate parts of jobs, but brittle workflows and unclear accountability can erase the expected savings.",
        evidence: [
          "Daily digest on Block layoffs",
          "Daily digest on AI job-market valuation",
          "Axios lobbying report dated April 21, 2026",
        ],
        implications: [
          "Boards should ask for exception handling metrics before approving labor substitution plans.",
          "Managers should map tasks, not job titles, when deciding where AI belongs.",
        ],
        uncertainty:
          "Company-specific labor outcomes can differ sharply by workflow, data quality, and management discipline.",
      },
      {
        title: "The AI market is becoming a partner ecosystem contest",
        thesis:
          "Google Cloud's fund suggests that agentic AI adoption depends on trained partners, proofs of value, security assessments, and forward-deployed engineering more than model access alone.",
        evidence: [
          "Google Cloud partner fund announcement dated April 22, 2026",
          "Daily digest on Claude Design and product workflow expansion",
        ],
        implications: [
          "Enterprises should budget for integration and change management, not only model subscriptions.",
          "Investors should watch channel capacity and implementation margins alongside benchmark leadership.",
        ],
        uncertainty:
          "Partner funding does not guarantee customers will reach durable ROI.",
      },
    ],
    sources: [
      {
        date: "2026-04-21",
        label: "Axios on Anthropic and OpenAI lobbying",
        url: "https://www.axios.com/2026/04/21/anthropic-outspends-openai-biggest-lobbying-quarter",
        note: "Used as evidence that AI policy, copyright, cybersecurity, and infrastructure are now central business issues.",
        type: "policy",
      },
      {
        date: "2026-04-22",
        label: "Google Cloud $750M partner fund",
        url: "https://www.googlecloudpresscorner.com/2026-04-22-Google-Cloud-Commits-750-Million-to-Accelerate-Partners-Agentic-AI-Development",
        note: "Used to frame enterprise AI as a partner-led implementation market.",
        type: "market memo",
      },
      {
        date: "2026-04-21",
        label: "Mozilla on Firefox 150 AI-assisted security fixes",
        url: "https://blog.mozilla.org/en/privacy-security/ai-security-zero-day-vulnerabilities/",
        note: "Used as a concrete example of AI-assisted vulnerability detection entering serious software work.",
        type: "security",
      },
    ],
    learningPlan: [
      "Free: list five tasks in your current work and mark which require judgment, data entry, writing, review, or escalation.",
      "Free: read a cloud partner announcement and identify the implementation services hidden behind the product language.",
      "Free mini-project: build a simple personal website page and use it to understand what AI code tools are actually generating.",
    ],
    actions: [
      "When someone says AI will replace a role, ask which tasks, what failure mode, and who signs off.",
      "Start a free learning log with one AI term, one example, and one unanswered question each day.",
      "Review security-sensitive AI outputs with extra skepticism; confident code can still be wrong.",
    ],
  },
  "2026-04-26": {
    title: "This Week in AI: Multi-Cloud Strategy, Personal Compute, and the Cost of the Buildout",
    executiveMemo:
      "This week connected hands-on learning with board-level infrastructure strategy. Nate's daily digests included beginner web development, model comparison, Microsoft testing Claude against Copilot, personal AI computers, and speculation about Anthropic moving deeper into workplace software. The external research layer made the strategic pattern sharper: OpenAI and Microsoft amended their partnership, OpenAI brought models and agents to AWS, Microsoft framed enterprise AI around trust and measurable operating value, and the IMF warned that AI-related capital expenditure and financing structures can amplify market risk. For executives, the question is whether AI strategy is becoming multi-cloud and workflow-native enough to avoid lock-in, while still governed tightly enough to control security, cost, and reliability.",
    boardImplications: [
      "Review vendor concentration risk: model access, cloud commitments, and software workflows are becoming entangled.",
      "Ask whether internal AI systems can move across clouds or models if pricing, capability, or compliance needs change.",
      "Treat personal AI computers and local inference as governance questions, not only hardware refresh decisions.",
      "Monitor financing and infrastructure exposure because AI buildouts increasingly rely on large capital commitments and complex counterparties.",
    ],
    marketLens:
      "The market lens is multi-cloud optionality plus financing discipline. OpenAI's AWS and Microsoft changes reduce one form of dependency but create a broader distribution contest. At the same time, the IMF's discussion of AI deal structures and data-center financing risk is a reminder that revenue narratives can run ahead of cash-flow durability.",
    whatChanged:
      "The weekly theme shifted from product features to strategic architecture: where models run, who controls the customer relationship, and how infrastructure cost flows through markets.",
    topics: [
      {
        topic: "Multi-cloud AI distribution",
        importance_score: 0.96,
        why_it_matters:
          "OpenAI's Microsoft amendment and AWS launch make cloud strategy part of AI strategy.",
      },
      {
        topic: "Enterprise trust and governance",
        importance_score: 0.88,
        why_it_matters:
          "Microsoft's enterprise framing emphasizes measurable business processes and trust controls.",
      },
      {
        topic: "Personal AI compute",
        importance_score: 0.8,
        why_it_matters:
          "Local hardware could matter again when privacy, latency, or cost make cloud-only workflows awkward.",
      },
      {
        topic: "AI financing risk",
        importance_score: 0.78,
        why_it_matters:
          "Data-center and AI-infrastructure spending can affect public markets, private credit, and corporate risk.",
      },
    ],
    researchBriefs: [
      {
        title: "OpenAI's channel strategy became visibly multi-cloud",
        thesis:
          "The Microsoft amendment and AWS launch show OpenAI moving toward broader distribution while preserving important Microsoft ties.",
        evidence: [
          "OpenAI Microsoft partnership update dated April 27, 2026",
          "OpenAI on AWS announcement dated April 28, 2026",
          "Daily digest on Microsoft testing Claude against Copilot",
        ],
        implications: [
          "Enterprises should avoid designing AI architecture around a single vendor assumption.",
          "Procurement teams should compare governance, data handling, support, and cloud commitments, not only model quality.",
        ],
        uncertainty:
          "Commercial terms can change, and public announcements do not reveal every constraint in private agreements.",
      },
      {
        title: "AI infrastructure has macro-financial consequences",
        thesis:
          "AI capital expenditure, data-center financing, and circular commercial relationships can amplify valuation risk if expected revenue does not materialize.",
        evidence: [
          "IMF Global Financial Stability Report, April 2026",
          "Daily digest on personal AI computers",
          "Daily digest on Anthropic and enterprise software speculation",
        ],
        implications: [
          "Boards should request unit economics for AI initiatives rather than treating AI spending as automatically strategic.",
          "Investors should separate durable workflow demand from infrastructure enthusiasm.",
        ],
        uncertainty:
          "The IMF report discusses system-level risk; it does not predict a specific AI company outcome.",
      },
    ],
    sources: [
      {
        date: "2026-04-27",
        label: "OpenAI and Microsoft partnership amendment",
        url: "https://openai.com/index/next-phase-of-microsoft-partnership/",
        note: "Used to explain why multi-cloud access and non-exclusive licensing matter for enterprise AI strategy.",
        type: "market memo",
      },
      {
        date: "2026-04-28",
        label: "OpenAI models, Codex, and Managed Agents on AWS",
        url: "https://openai.com/index/openai-on-aws/",
        note: "Used as evidence of OpenAI expanding enterprise deployment through AWS and Bedrock.",
        type: "guide",
      },
      {
        date: "2026-04-28",
        label: "Microsoft enterprise AI growth examples",
        url: "https://blogs.microsoft.com/blog/2026/04/28/unlocking-human-ambition-to-drive-business-growth-with-ai/",
        note: "Used to frame AI value around trusted business processes rather than generic productivity language.",
        type: "research",
      },
      {
        date: "2026-04",
        label: "IMF Global Financial Stability Report",
        url: "https://www.imf.org/-/media/files/publications/gfsr/2026/april/english/text.pdf",
        note: "Used for market-risk context around AI-related investment, data-center financing, and valuation concentration.",
        type: "market memo",
      },
    ],
    learningPlan: [
      "Free: build one static HTML page and then ask an AI tool to modify it so you can see what changed.",
      "Free: make a vendor comparison table with columns for model, cloud, data retention, audit logs, pricing, and fallback plan.",
      "Free mini-project: run the same prompt through two free model interfaces and compare where each admits uncertainty.",
    ],
    actions: [
      "Before choosing an AI vendor, write down the exit plan and data-migration plan.",
      "Separate local-device AI ideas from cloud-agent ideas; they solve different problems.",
      "For any AI infrastructure budget, ask how usage will be measured at the unit level.",
    ],
  },
  "2026-05-03": {
    title: "This Week in AI: Agentic Commerce, Wall Street Deployment, and Security Reality",
    executiveMemo:
      "This was the strongest 'AI as operating system for business' week in the starter archive. Nate's videos covered agentic payments, fragile job security, beginner web skills, the need for better work primitives, swappable agent brains, and Mozilla's AI-assisted vulnerability findings. The research layer showed the same pattern at market scale: Anthropic and OpenAI moved toward private-equity-backed deployment companies, major labs expanded government pre-release testing arrangements, and Mozilla published more detail on how AI security pipelines actually worked. The board memo is clear: AI is shifting from tool selection to operating infrastructure. Payment rails, workflow primitives, deployment partners, and security verification are now part of the same strategic conversation.",
    boardImplications: [
      "Treat agentic payments as a control problem: authorization, audit logs, limits, dispute handling, and vendor liability matter as much as convenience.",
      "If private-equity-backed AI deployment firms enter your sector, expect faster competitor experimentation but uneven implementation quality.",
      "Require security review for agent frameworks that can swap models or tools, because flexibility can also widen the attack surface.",
      "Reskill non-technical workers toward workflow ownership, review, and basic web/software literacy instead of telling them only to 'learn AI'.",
    ],
    marketLens:
      "The week showed capital moving from model creation into deployment capacity. Anthropic's services company with major financial partners and reports of OpenAI's PE-backed deployment push both suggest investors want AI to reach the middle market through hands-on implementation. The opportunity is operational leverage; the risk is overpromising ROI before workflow controls, security, and human adoption are ready.",
    whatChanged:
      "The archive moved from 'agents are coming' to 'agents need economic rails, work primitives, deployment partners, and security pipelines.' That is a more mature and more demanding framing.",
    topics: [
      {
        topic: "Agentic commerce and payments",
        importance_score: 0.96,
        why_it_matters:
          "Stripe, Visa, Microsoft, and agent platforms are converging on delegated transactions that need strong controls.",
      },
      {
        topic: "Deployment companies and private equity",
        importance_score: 0.92,
        why_it_matters:
          "Capital is moving toward implementation arms that can push AI into mid-market operations.",
      },
      {
        topic: "AI security verification",
        importance_score: 0.9,
        why_it_matters:
          "Mozilla's results show real defensive leverage, but also a major triage and governance burden.",
      },
      {
        topic: "Work primitives for agents",
        importance_score: 0.84,
        why_it_matters:
          "Agents need structured tasks, memory, permissions, and review, not only browser clicking.",
      },
    ],
    researchBriefs: [
      {
        title: "AI deployment is becoming a Wall Street-backed services market",
        thesis:
          "Anthropic's May 4 services-company announcement and reporting on OpenAI's parallel deployment venture show a move from selling models to installing operating capability inside companies.",
        evidence: [
          "Anthropic enterprise AI services company announcement dated May 4, 2026",
          "Axios coverage of OpenAI and Anthropic private-equity partnerships dated May 4, 2026",
          "Daily digest on the agentic economy",
        ],
        implications: [
          "Mid-market firms may get more access to advanced AI implementation, but vendor incentives must be watched carefully.",
          "Boards should ask whether a deployment partner is paid for durable value, usage growth, or financial engineering.",
        ],
        uncertainty:
          "Reported venture economics and customer outcomes may change, and announcements do not prove realized ROI.",
      },
      {
        title: "Agentic systems need security and transaction controls before scale",
        thesis:
          "Agentic payments and swappable agent frameworks are useful only if identity, permissions, auditability, and vulnerability management are designed into the workflow.",
        evidence: [
          "Daily digest on Stripe, Visa, and Microsoft building agentic commerce",
          "Daily digest on work primitives",
          "Mozilla Hacks article dated May 7, 2026",
          "Tom's Hardware report dated May 5, 2026 on pre-release model testing access",
        ],
        implications: [
          "Finance, legal, and security teams should be involved before agents can spend money or take external actions.",
          "AI security wins can increase remediation workload, so staffing and triage matter.",
        ],
        uncertainty:
          "The public sources describe high-level arrangements and case studies, not a universal standard for agent safety.",
      },
    ],
    sources: [
      {
        date: "2026-05-04",
        label: "Anthropic enterprise AI services company",
        url: "https://www.anthropic.com/news/enterprise-ai-services-company",
        note: "Used as primary evidence that frontier labs are building implementation capacity with financial partners.",
        type: "market memo",
      },
      {
        date: "2026-05-04",
        label: "Axios on OpenAI and Anthropic private-equity partnerships",
        url: "https://www.axios.com/2026/05/04/openai-anthropic-private-equity-enterprise-business",
        note: "Used as context that both major labs are courting deployment vehicles for mid-sized companies.",
        type: "market memo",
      },
      {
        date: "2026-05-05",
        label: "Major labs and US pre-release model testing",
        url: "https://www.tomshardware.com/tech-industry/artificial-intelligence/google-microsoft-and-xai-agree-to-let-us-govenment-test-ai-models-before-public-release",
        note: "Used to frame frontier-model governance and safety testing as a market and policy issue.",
        type: "policy",
      },
      {
        date: "2026-05-07",
        label: "Mozilla Hacks on hardening Firefox with Claude Mythos Preview",
        url: "https://hacks.mozilla.org/2026/05/behind-the-scenes-hardening-firefox/",
        note: "Used for detail on the agentic vulnerability pipeline and the scale of April security fixes.",
        type: "security",
      },
    ],
    learningPlan: [
      "Free: map a purchase workflow and mark every place an AI agent would need permission, a dollar limit, and a receipt.",
      "Free: build a tiny website page, then add a form, so agent/browser automation concepts feel less abstract.",
      "Free: read Mozilla's FAQ on AI-found security bugs and write down the difference between finding a bug and proving a real exploit.",
    ],
    actions: [
      "Create a simple policy for what an agent is allowed to do without approval, with approval, and never.",
      "For agentic commerce pilots, log every proposed transaction and require human approval until error rates are known.",
      "Use the beginner web tutorial digest as a free foundation path; understanding HTML and links makes AI agents much less mysterious.",
    ],
  },
};

async function main() {
  const sql = getSql();
  const minTranscriptCharacters = minimumTranscriptCharacters();
  try {
    const weeks = await sql<WeeklyRow[]>`
      select weekly_digests.id, weekly_digests.creator_id, week_start::text, week_end::text
      from weekly_digests
      join creators on creators.id = weekly_digests.creator_id
      where lower(coalesce(creators.channel_url, '')) like '%natebjones%'
         or lower(coalesce(creators.handle, '')) like '%natebjones%'
         or lower(coalesce(creators.title, '')) = 'nate b. jones'
      order by week_start asc
    `;

    let updated = 0;
    for (const week of weeks) {
      const config = weeklyResearch[week.week_start];
      if (!config) continue;

      const dailyRows = await sql<DailyRow[]>`
        select
          video_id::text,
          transcript_id::text,
          transcript_source,
          transcript_length,
          digest_date::text,
          title,
          front_page_summary,
          plain_english_explanation,
          why_it_matters,
          full_digest_json
        from daily_digests
        where creator_id = ${week.creator_id}
          and digest_date between ${week.week_start} and ${week.week_end}
          and grounding_status = 'grounded'
          and transcript_source = any(${VERIFIED_TRANSCRIPT_SOURCES}::text[])
          and coalesce(transcript_length, 0) >= ${minTranscriptCharacters}
        order by digest_date asc, created_at asc
      `;

      const rawPayload = buildPayload(week, dailyRows, config);
      const sourceReferences = buildWeeklySourceReferences(dailyRows);
      const generationTimestamp = new Date().toISOString();
      const payload = weeklyDigestSchema.parse({
        ...rawPayload,
        weekly_grounding: {
          grounded: dailyRows.length > 0,
          source: "daily_digests_and_curated_research",
          source_digest_count: dailyRows.length,
          source_date_range: {
            start: week.week_start,
            end: week.week_end,
          },
          generated_at: generationTimestamp,
          generation_model: "curated:weekly_research_refresh",
          limitations: [
            "Curated research notes are date-scoped operator inputs; daily video claims remain grounded in transcript-backed daily digests.",
          ],
        },
        source_references: sourceReferences,
      });
      await sql`
        update weekly_digests
        set
          source_digest_count = ${payload.weekly_grounding.source_digest_count},
          source_date_range = ${sql.json(toJsonParameter(payload.weekly_grounding.source_date_range))},
          grounding_status = ${payload.weekly_grounding.grounded ? "grounded" : "pending"},
          generation_model = ${payload.weekly_grounding.generation_model ?? null},
          generated_at = ${payload.weekly_grounding.generated_at ?? null},
          processing_status = ${payload.weekly_grounding.grounded ? "digest_generated" : "pending"},
          source_references = ${sql.json(toJsonParameter(sourceReferences))},
          title = ${payload.title},
          newsletter_markdown = ${payload.newsletter_markdown},
          ranked_topics = ${sql.json(payload.ranked_topics)},
          what_changed = ${payload.what_changed},
          what_to_do_next = ${sql.json(payload.what_to_do_next)},
          full_digest_json = ${sql.json(toJsonParameter(payload))},
          updated_at = now()
        where id = ${week.id}
      `;
      updated += 1;
      console.log(`Updated weekly research digest for ${week.week_start} to ${week.week_end}.`);
    }
    console.log(`Updated ${updated} weekly digest(s).`);
  } finally {
    await closeSql();
  }
}

function buildPayload(week: WeeklyRow, dailyRows: DailyRow[], config: WeeklyConfig) {
  const posts = buildWeeklyPosts(dailyRows, config);
  const dailyTitles = dailyRows.map((row) => row.title);
  const sourceNotes = [
    ...dailyRows.map((row) => ({
      date: row.digest_date,
      label: `Daily digest: ${row.title}`,
      note: "Stored daily digest used as source-backed weekly context.",
    })),
    ...config.sources.map((source) => ({
      date: source.date,
      label: source.label,
      url: source.url,
      note: source.note,
    })),
  ];
  const levels = buildExplanationLevels(dailyRows);
  const newsletter = buildNewsletterMarkdown({
    week,
    config,
    posts,
    dailyTitles,
    levels,
  });

  return {
    title: config.title,
    newsletter_markdown: newsletter,
    explanation_levels: levels,
    executive_insights_memo: config.executiveMemo,
    board_level_implications: config.boardImplications,
    market_investment_lens: config.marketLens,
    weekly_posts: posts,
    research_briefs: config.researchBriefs,
    source_notes: sourceNotes,
    ranked_topics: config.topics,
    what_changed: config.whatChanged,
    what_to_do_next: config.actions,
    free_learning_plan: config.learningPlan,
  };
}

function buildWeeklyPosts(dailyRows: DailyRow[], config: WeeklyConfig) {
  const videoPosts = dailyRows.map((row) => ({
    date: row.digest_date,
    type: inferVideoType(row.title),
    title: row.title,
    summary: row.front_page_summary,
    why_it_matters: row.why_it_matters,
  }));
  const researchPosts = config.sources.map((source) => ({
    date: source.date,
    type: source.type,
    title: source.label,
    summary: source.note,
    why_it_matters: whySourceMatters(source.type),
    source_url: source.url,
  }));
  const guidePosts = config.actions.map((action, index) => ({
    date: config.sources[index % config.sources.length]?.date ?? dailyRows[0]?.digest_date ?? "2026-05-09",
    type: "how-to",
    title: `How-to: ${action.replace(/\.$/, "")}`,
    summary:
      "A practical exercise drawn from the week's daily digests and research notes for readers who want to upskill without paid courses.",
    why_it_matters:
      "The weekly memo should leave the reader with something concrete to try, not only a market narrative.",
  }));

  return [...videoPosts, ...researchPosts, ...guidePosts].slice(0, 10);
}

function inferVideoType(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes("build your first website")) return "guide";
  if (lower.includes("sleep") || lower.includes("smile")) return "learning context";
  return "video";
}

function whySourceMatters(type: ResearchSource["type"]) {
  switch (type) {
    case "market memo":
      return "It connects the creator's AI themes to capital allocation, distribution, and enterprise adoption.";
    case "policy":
      return "It shows that AI strategy now includes regulators, government testing, and public accountability.";
    case "security":
      return "It grounds the week's agent discussion in the practical problem of finding, triaging, and fixing real software risk.";
    case "guide":
      return "It turns the week's ideas into a concrete workflow or product example that a non-programmer can inspect.";
    default:
      return "It adds date-scoped context outside the creator's videos without treating it as certainty.";
  }
}

function buildExplanationLevels(dailyRows: DailyRow[]) {
  const dailyLevels = dailyRows.map((row) =>
    normalizeExplanationLevels(readDailyLevels(row.full_digest_json), row.plain_english_explanation),
  );
  const beginnerBasis = dailyLevels.map((level) => level.beginner).join(" ");
  const intermediateBasis = dailyLevels.map((level) => level.intermediate).join(" ");
  const advancedBasis = dailyLevels.map((level) => level.advanced).join(" ");

  return {
    beginner:
      `This week in AI, the simple story is: AI is becoming less like a single chatbot and more like a set of helpers inside real work. ` +
      `Those helpers can draft, design, code, check software, or move a task along, but they still need instructions, limits, and a person who checks the result. ` +
      `From the daily digests: ${truncate(beginnerBasis, 650)} The safest takeaway is to learn the basic words, try small free projects, and ask "what evidence supports this?" before trusting big claims.`,
    intermediate:
      `At an intermediate level, this week was about workflow adoption. The daily digests point to agents, model comparisons, job-market pressure, and practical web skills; the research notes add cloud distribution, policy, security, or market context. ` +
      `The pattern is that AI value depends on implementation: data access, permissions, evaluation, review, and cost control. ${truncate(intermediateBasis, 700)}`,
    advanced:
      `At the advanced level, the week is about control surfaces. Models are only one layer; cloud channels, partner ecosystems, agent runtimes, payment permissions, cyber-evaluation pipelines, and financing structures shape what can be deployed safely and profitably. ` +
      `${truncate(advancedBasis, 720)} The uncertainty is that product announcements and creator commentary can identify strategic pressure, but they do not prove durable ROI by themselves.`,
  };
}

function readDailyLevels(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const levels = (value as { explanation_levels?: unknown }).explanation_levels;
  if (!levels || typeof levels !== "object" || Array.isArray(levels)) return null;
  return levels as Partial<Record<"beginner" | "intermediate" | "advanced", string>>;
}

function buildNewsletterMarkdown(input: {
  week: WeeklyRow;
  config: WeeklyConfig;
  posts: Array<{ date: string; type: string; title: string; summary: string; why_it_matters: string }>;
  dailyTitles: string[];
  levels: { beginner: string; intermediate: string; advanced: string };
}) {
  const { week, config, posts, dailyTitles, levels } = input;
  return [
    `# ${config.title}`,
    "",
    `**Week covered:** ${week.week_start} to ${week.week_end}`,
    "",
    "## Executive Insights Memo",
    "",
    config.executiveMemo,
    "",
    "## The Board-Level Read",
    "",
    ...config.boardImplications.map((item) => `- ${item}`),
    "",
    "## Markets And Investments",
    "",
    config.marketLens,
    "",
    "## Ten Posts From The Week",
    "",
    ...posts.map(
      (post, index) =>
        `${index + 1}. **${post.date} / ${post.type}: ${post.title}.** ${post.summary} Why it matters: ${post.why_it_matters}`,
    ),
    "",
    "## Deep Research Briefs",
    "",
    ...config.researchBriefs.flatMap((brief) => [
      `### ${brief.title}`,
      "",
      `**Thesis:** ${brief.thesis}`,
      "",
      `**Evidence:** ${brief.evidence.join("; ")}.`,
      "",
      `**Implications:** ${brief.implications.join("; ")}.`,
      "",
      `**Uncertainty:** ${brief.uncertainty}`,
      "",
    ]),
    "## Explanation Levels",
    "",
    `**Beginner:** ${levels.beginner}`,
    "",
    `**Intermediate:** ${levels.intermediate}`,
    "",
    `**Advanced:** ${levels.advanced}`,
    "",
    "## What Changed",
    "",
    config.whatChanged,
    "",
    "## Free Upskilling Plan",
    "",
    ...config.learningPlan.map((item) => `- ${item}`),
    "",
    "## What To Do Next",
    "",
    ...config.actions.map((item) => `- ${item}`),
    "",
    "## Creator Videos Used",
    "",
    ...(dailyTitles.length ? dailyTitles.map((title) => `- ${title}`) : ["- No daily digests were available for this week."]),
    "",
    "## Skepticism And Uncertainty",
    "",
    "This weekly edition combines stored daily digests with date-scoped research notes. It avoids treating announcements as proof of durable ROI, and it does not assume the creator's framing covers the whole AI market.",
  ].join("\n");
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
}

function toJsonParameter(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
