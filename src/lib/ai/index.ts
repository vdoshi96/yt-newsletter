import {
  dailyDigestSchema,
  weeklyDigestSchema,
  type WeeklyDigestPayload,
} from "@/lib/digests/schemas";
import { normalizeDailyDigestModelPayload } from "@/lib/ai/daily-payload";
import { callChatProvider } from "@/lib/ai/providers";
import { parseJsonFromModel } from "@/lib/ai/json";
import { logModelUsage } from "@/lib/ai/usage";
import type { AiProvider, ChatMessage } from "@/lib/ai/types";
import { booleanEnv, numberEnv } from "@/lib/config";
import {
  assertDailyDigestGrounding,
  buildDailyDigestMessages,
  buildTranscriptGroundingMetadata,
  type DailyDigestTranscriptRecord,
  validateTranscriptForDailyDigest,
} from "@/lib/digests/grounding";
import { assertWeeklyDigestGrounding } from "@/lib/weekly/source-text";

export async function generateDailyDigestPayload(input: {
  creatorId: string;
  videoId: string;
  transcript: DailyDigestTranscriptRecord;
  prompt: string;
  previousDailyContext?: string;
  regeneratedAfterHallucinationFix?: boolean;
}) {
  const verifiedTranscript = validateTranscriptForDailyDigest({
    expectedVideoId: input.videoId,
    transcript: input.transcript,
  });
  const messages = buildDailyDigestMessages({
    prompt: input.prompt,
    videoId: input.videoId,
    transcript: verifiedTranscript,
    previousDailyContext: input.previousDailyContext,
  });

  const route: ProviderRouteOption[] = [
    {
      provider: "deepseek",
      model: process.env.DEEPSEEK_DAILY_MODEL ?? "deepseek-v4-pro",
      attempts: numberEnv("DEEPSEEK_DAILY_MAX_ATTEMPTS", 2),
      maxTokens: optionalNumberEnv("DAILY_AI_MAX_OUTPUT_TOKENS"),
      reasoningEffort: parseDeepSeekReasoningEffort(process.env.DEEPSEEK_DAILY_REASONING_EFFORT),
    },
    {
      provider: "qwen",
      model: process.env.QWEN_DAILY_FALLBACK_MODEL ?? "qwen3-max",
      attempts: numberEnv("QWEN_DAILY_FALLBACK_MAX_ATTEMPTS", 1),
      maxTokens: optionalNumberEnv("DAILY_AI_MAX_OUTPUT_TOKENS"),
    },
  ];
  const failures: string[] = [];

  for (const option of route) {
    for (let attempt = 1; attempt <= option.attempts; attempt += 1) {
      try {
        const result = await runProviderRoute({
          label: "Daily digest",
          option,
          attempt,
          messages,
          taskType: "daily_structured_digest",
          creatorId: input.creatorId,
          videoId: input.videoId,
        });
        const generationTimestamp = new Date().toISOString();
        const rawPayload = normalizeDailyDigestModelPayload(
          parseJsonFromModel<Record<string, unknown>>(result.text),
        );
        const parsed = dailyDigestSchema.parse({
          ...rawPayload,
          transcript_grounding: undefined,
        });
        assertDailyDigestGrounding({
          transcriptText: verifiedTranscript.transcript_text,
          digest: parsed,
        });
        return dailyDigestSchema.parse({
          ...parsed,
          transcript_grounding: buildTranscriptGroundingMetadata({
            transcript: verifiedTranscript,
            generationTimestamp,
            generationModel: `${option.provider}:${option.model}`,
            sourceNotes: parsed.source_notes,
            regeneratedAfterHallucinationFix: input.regeneratedAfterHallucinationFix,
          }),
        });
      } catch (error) {
        const message = (error as Error).message;
        failures.push(`${option.provider}:${option.model}: attempt ${attempt}: ${message}`);
        console.warn(
          `Daily digest provider failed: provider=${option.provider} model=${option.model} attempt=${attempt}/${option.attempts} message=${message}`,
        );
      }
    }
  }

  throw new Error(`Daily digest generation failed for all providers: ${failures.join(" | ")}`);
}

export async function generateWeeklyDigestPayload(input: {
  creatorId: string;
  weekStart: string;
  weekEnd: string;
  sourceText: string;
  prompt: string;
  sourceDigestCount?: number;
}) {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a careful weekly newsletter editor. Return strict JSON only, mark uncertainty, and use only source labels and dates that appear in the supplied transcript-grounded daily digests. Do not add external research notes or outside sources.",
    },
    {
      role: "user",
      content: `${input.prompt}\n\nWEEK: ${input.weekStart} to ${input.weekEnd}\n\nSOURCE DIGESTS:\n${input.sourceText}`,
    },
  ];

  const route: ProviderRouteOption[] = [
    {
      provider: "deepseek",
      model: process.env.DEEPSEEK_WEEKLY_MODEL ?? "deepseek-v4-pro",
      attempts: numberEnv("DEEPSEEK_WEEKLY_MAX_ATTEMPTS", 3),
      maxTokens: optionalNumberEnv("WEEKLY_AI_MAX_OUTPUT_TOKENS"),
      reasoningEffort: parseDeepSeekReasoningEffort(process.env.DEEPSEEK_WEEKLY_REASONING_EFFORT),
    },
    {
      provider: "kimi",
      model: process.env.KIMI_WEEKLY_MODEL ?? "moonshot-v1-32k",
      attempts: numberEnv("KIMI_WEEKLY_MAX_ATTEMPTS", 1),
      maxTokens: optionalNumberEnv("WEEKLY_AI_MAX_OUTPUT_TOKENS"),
    },
  ];

  const failures: string[] = [];
  for (const option of route) {
    for (let attempt = 1; attempt <= option.attempts; attempt += 1) {
      try {
        const result = await runProviderRoute({
          label: "Weekly digest",
          option,
          attempt,
          messages,
          taskType: "weekly_digest",
          creatorId: input.creatorId,
        });
        const generationTimestamp = new Date().toISOString();
        const parsed = weeklyDigestSchema.parse({
          ...parseJsonFromModel<Record<string, unknown>>(result.text),
          weekly_grounding: undefined,
          podcast_generation: undefined,
        });
        assertWeeklyDigestGrounding({
          sourceText: input.sourceText,
          digest: parsed,
        });
        return weeklyDigestSchema.parse({
          ...parsed,
          weekly_grounding: buildWeeklyGroundingMetadata({
            weekStart: input.weekStart,
            weekEnd: input.weekEnd,
            sourceDigestCount: input.sourceDigestCount,
            generationTimestamp,
            generationModel: `${option.provider}:${option.model}`,
          }),
        });
      } catch (error) {
        const message = (error as Error).message;
        failures.push(`${option.provider}:${option.model}: attempt ${attempt}: ${message}`);
        console.warn(
          `Weekly digest provider failed: provider=${option.provider} model=${option.model} attempt=${attempt}/${option.attempts} message=${message}`,
        );
      }
    }
  }

  if (!booleanEnv("ALLOW_WEEKLY_DIGEST_FALLBACK", false)) {
    throw new Error(`Weekly digest generation failed for all providers: ${failures.join(" | ")}`);
  }

  console.warn(
    `Weekly digest provider route exhausted; using deterministic source-backed fallback because ALLOW_WEEKLY_DIGEST_FALLBACK is enabled. failures=${failures.join(" | ")}`,
  );
  return buildSourceBackedWeeklyFallback({
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    sourceText: input.sourceText,
    sourceDigestCount: input.sourceDigestCount,
  });
}

export async function generatePodcastScriptPayload(input: {
  creatorId: string;
  weekStart: string;
  weekEnd: string;
  weeklyDigest: WeeklyDigestPayload;
  sourceText: string;
  prompt: string;
  hostNames?: string;
}) {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a senior podcast producer and technology editor. Return strict JSON only. Write natural spoken language from the supplied grounded weekly digest and transcript-derived source material.",
    },
    {
      role: "user",
      content: [
        input.prompt,
        "",
        `WEEK: ${input.weekStart} to ${input.weekEnd}`,
        `HOSTS: ${input.hostNames ?? "Maya and Theo"}`,
        "",
        "WEEKLY DIGEST JSON:",
        JSON.stringify(input.weeklyDigest),
        "",
        "SOURCE DIGESTS AND TRANSCRIPT-DERIVED RHYTHM SAMPLES:",
        input.sourceText,
      ].join("\n"),
    },
  ];

  const route: ProviderRouteOption[] = [
    {
      provider: "deepseek",
      model: process.env.DEEPSEEK_PODCAST_MODEL ?? "deepseek-v4-pro",
      attempts: numberEnv("DEEPSEEK_PODCAST_MAX_ATTEMPTS", 2),
      maxTokens: numberEnv("PODCAST_SCRIPT_MAX_OUTPUT_TOKENS", 24_000),
      reasoningEffort: parseDeepSeekReasoningEffort(process.env.DEEPSEEK_PODCAST_REASONING_EFFORT),
    },
    {
      provider: "kimi",
      model: process.env.KIMI_PODCAST_MODEL ?? "moonshot-v1-32k",
      attempts: numberEnv("KIMI_PODCAST_MAX_ATTEMPTS", 1),
      maxTokens: numberEnv("PODCAST_SCRIPT_MAX_OUTPUT_TOKENS", 24_000),
    },
  ];

  const failures: string[] = [];
  for (const option of route) {
    for (let attempt = 1; attempt <= option.attempts; attempt += 1) {
      try {
        const result = await runProviderRoute({
          label: "Podcast script",
          option,
          attempt,
          messages,
          taskType: "podcast_script",
          creatorId: input.creatorId,
        });
        const parsed = parseJsonFromModel<Record<string, unknown>>(result.text);
        const script = typeof parsed.podcast_script === "string" ? parsed.podcast_script.trim() : "";
        if (!script) throw new Error("Podcast script payload did not include podcast_script.");
        return {
          podcast_script: script,
          podcast_generation: {
            status: "script_generated",
            provider: option.provider,
            model: option.model,
            generated_at: new Date().toISOString(),
          },
        };
      } catch (error) {
        const message = (error as Error).message;
        failures.push(`${option.provider}:${option.model}: attempt ${attempt}: ${message}`);
        console.warn(
          `Podcast script provider failed: provider=${option.provider} model=${option.model} attempt=${attempt}/${option.attempts} message=${message}`,
        );
      }
    }
  }

  throw new Error(`Podcast script generation failed for all providers: ${failures.join(" | ")}`);
}

type ProviderRouteOption = {
  provider: AiProvider;
  model: string;
  attempts: number;
  maxTokens?: number;
  reasoningEffort?: "high" | "max";
};

async function runProviderRoute(input: {
  label: string;
  option: ProviderRouteOption;
  attempt: number;
  messages: ChatMessage[];
  taskType: Parameters<typeof logModelUsage>[0]["taskType"];
  creatorId: string;
  videoId?: string;
}) {
  const result = await callChatProvider({
    provider: input.option.provider,
    model: input.option.model,
    messages: input.messages,
    responseFormat: "json_object",
    maxTokens: input.option.maxTokens,
    reasoningEffort: input.option.reasoningEffort,
  });
  await logModelUsage(
    {
      provider: input.option.provider,
      model: input.option.model,
      taskType: input.taskType,
      creatorId: input.creatorId,
      videoId: input.videoId,
    },
    result,
  );
  console.info(
    `[ai:${input.label.toLowerCase().replace(/\s+/g, "-")}-generated]`,
    {
      provider: input.option.provider,
      model: input.option.model,
      attempt: input.attempt,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    },
  );
  return result;
}

function parseDeepSeekReasoningEffort(value: string | undefined): "high" | "max" {
  return value === "max" ? "max" : "high";
}

function optionalNumberEnv(name: string) {
  const value = process.env[name];
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

type ParsedWeeklySourceItem = {
  date: string;
  title: string;
  summary: string;
  beginner: string;
  intermediate: string;
  advanced: string;
  whyItMatters: string;
  transcriptSource: string;
  transcriptLength: number | null;
  quotes: string[];
};

function buildSourceBackedWeeklyFallback(input: {
  weekStart: string;
  weekEnd: string;
  sourceText: string;
  sourceDigestCount?: number;
}) {
  const items = parseWeeklySourceItems(input.sourceText);
  const themes = rankFallbackThemes(items);
  const sourceDigestCount = input.sourceDigestCount ?? items.length;
  const primaryTheme = themes[0]?.topic ?? "Grounded AI coverage";
  const itemLabels = items.map((item) => `${item.date}: ${item.title}`);
  const sourceNotes = items.slice(0, 10).map((item) => ({
    date: item.date,
    label: `Daily digest: ${item.title}`,
    note: "Transcript-grounded daily digest used as fallback weekly source context.",
  }));

  const weeklyPosts = items.map((item) => ({
    date: item.date,
    type: "video",
    title: item.title,
    summary: trimText(item.summary, 520),
    why_it_matters: trimText(item.whyItMatters, 420),
  }));

  const themeBullets = themes.length
    ? themes.map((theme) => `- ${theme.topic}: ${theme.summary}`).join("\n")
    : "- Source coverage: The week is represented by the grounded daily digest records available in the archive.";
  const coverageBullets = itemLabels.length
    ? itemLabels.map((label) => `- ${label}`).join("\n")
    : "- No daily source labels were available.";
  const takeaways = buildFallbackTakeaways(primaryTheme);

  return weeklyDigestSchema.parse({
    title: `Weekly digest: ${input.weekStart} to ${input.weekEnd}`,
    newsletter_markdown:
      `# Weekly digest: ${input.weekStart} to ${input.weekEnd}\n\n` +
      `This edition is a deterministic fallback synthesized from ${sourceDigestCount} transcript-grounded daily digest record(s). It does not add outside news or market claims.\n\n` +
      "## Major themes\n\n" +
      themeBullets +
      "\n\n## Practical takeaways\n\n" +
      takeaways.map((takeaway) => `- ${takeaway}`).join("\n") +
      "\n\n## Unresolved questions\n\n" +
      "- Which of these creator themes are durable enough to justify a small experiment?\n" +
      "- Which claims need a fresher primary source before becoming strategy?\n" +
      "- What would change if the same workflow had to run weekly without manual cleanup?\n\n" +
      "## Daily source coverage\n\n" +
      coverageBullets,
    executive_insights_memo:
      `The week should be read as a source-grounded pattern map, not a market forecast. The strongest available signal is ${primaryTheme.toLowerCase()}, based on the regenerated daily digests and their transcript anchors. A useful executive move is to convert that theme into one small, measurable workflow test while keeping unsupported predictions out of the decision memo.`,
    board_level_implications: [
      "Separate transcript-backed creator claims from external market interpretation before using the archive in planning.",
      "Ask which repeated workflow, evaluation, cost, or safety concern deserves a small operational experiment.",
      "Treat provider fallback output as conservative synthesis until the richer weekly model route is healthy.",
    ],
    market_investment_lens:
      "No verified surrounding market research was available in fallback mode, so this section avoids investment claims. The practical signal is narrower: repeated transcript-grounded creator themes can still reveal operational pressure points such as reliability, evaluation, workflow design, cost control, or safety review. Those pressure points are useful for prioritizing experiments, but they are not evidence of market size, vendor performance, or future returns by themselves.",
    weekly_posts: weeklyPosts,
    research_briefs: [
      {
        title: "Grounded weekly pattern",
        thesis:
          `${primaryTheme} was the clearest theme available from the regenerated daily digest set.`,
        evidence: itemLabels.slice(0, 6),
        implications: [
          "Use the theme to pick one practical experiment rather than treating the week as a complete market survey.",
          "Keep the daily transcript anchors attached when reusing the weekly synthesis in a podcast or dashboard.",
        ],
        uncertainty:
          "This fallback does not include independent external research, so surrounding news context should be added only from verified sources.",
      },
      {
        title: "Provider fallback boundary",
        thesis:
          "The archive can remain useful when weekly model providers fail, but the fallback should stay conservative.",
        evidence: [
          "Weekly provider route failed before producing a validated payload.",
          `${sourceDigestCount} grounded daily digest record(s) were available as source material.`,
        ],
        implications: [
          "Readers still get a synthesized source-backed weekly archive.",
          "Deeper market, investment, and external-news claims should wait for verified research or a successful model regeneration.",
        ],
        uncertainty:
          "Provider availability and context-window behavior can change, so this week can be regenerated later.",
      },
    ],
    source_notes: sourceNotes,
    weekly_grounding: buildWeeklyGroundingMetadata({
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
      sourceDigestCount,
      generationTimestamp: new Date().toISOString(),
      generationModel: "local:fallback",
      limitations: [
        "Configured weekly providers failed, so this fallback synthesizes regenerated daily digest text only.",
        "No external surrounding news was added.",
      ],
    }),
    explanation_levels: {
      beginner:
        `At a beginner level, this week is about spotting repeated ideas. The archive found ${sourceDigestCount} grounded daily digest record(s) and grouped them around ${primaryTheme.toLowerCase()} without adding new facts.`,
      intermediate:
        "At an intermediate level, the fallback compares daily summaries, why-it-matters sections, and explanation levels to identify repeated engineering and product concerns.",
      advanced:
        "At an advanced level, this is a conservative synthesis layer over transcript-grounded daily artifacts. It preserves provenance and avoids external inference when provider-backed weekly research is unavailable.",
    },
    ranked_topics: themes.slice(0, 5).map((theme, index) => ({
      topic: theme.topic,
      importance_score: Math.max(0.25, 0.95 - index * 0.12),
      why_it_matters: theme.summary,
    })),
    what_changed:
      `The archive moved from separate daily records into a weekly pattern map centered on ${primaryTheme.toLowerCase()}.`,
    what_to_do_next: takeaways,
    free_learning_plan: [
      "Read the grounded daily digests for the week before using the synthesis in planning.",
      "Pick one recurring concept and review free official docs or examples related to it.",
      "Write down what evidence would be needed before turning the weekly theme into a recommendation.",
    ],
    podcast_script:
      `This week covers ${primaryTheme.toLowerCase()} using only regenerated daily digests and transcript-backed source notes.`,
  });
}

const WEEKLY_SOURCE_LABELS = [
  "Date",
  "Title",
  "Summary",
  "Beginner explanation",
  "Intermediate explanation",
  "Advanced explanation",
  "Why it matters",
  "Transcript source",
  "Transcript length",
  "Model",
  "Transcript quote anchors",
  "Quote",
];

function parseWeeklySourceItems(sourceText: string): ParsedWeeklySourceItem[] {
  return sourceText
    .split(/\n\n---\n\n/g)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const title = readWeeklySourceField(block, "Title");
      const date = readWeeklySourceField(block, "Date");
      const summary = readWeeklySourceField(block, "Summary");
      return {
        date: date || "unknown",
        title: title || "Untitled daily digest",
        summary: summary || "A grounded daily digest was available for this date.",
        beginner: readWeeklySourceField(block, "Beginner explanation"),
        intermediate: readWeeklySourceField(block, "Intermediate explanation"),
        advanced: readWeeklySourceField(block, "Advanced explanation"),
        whyItMatters:
          readWeeklySourceField(block, "Why it matters") ||
          "This daily source helps anchor the weekly synthesis.",
        transcriptSource: readWeeklySourceField(block, "Transcript source"),
        transcriptLength: readNumber(readWeeklySourceField(block, "Transcript length")),
        quotes: [...block.matchAll(/^Quote:\s*(.+)$/gm)]
          .map((match) => cleanInlineText(match[1]))
          .filter(Boolean)
          .slice(0, 4),
      };
    })
    .filter((item) => item.date !== "unknown" || item.title !== "Untitled daily digest");
}

function readWeeklySourceField(block: string, label: string) {
  const nextLabels = WEEKLY_SOURCE_LABELS.filter((candidate) => candidate !== label)
    .map(escapeRegExp)
    .join("|");
  const pattern = new RegExp(
    `^${escapeRegExp(label)}:\\s*([\\s\\S]*?)(?=\\n(?:${nextLabels}):\\s|$)`,
    "m",
  );
  return cleanInlineText(pattern.exec(block)?.[1] ?? "");
}

type FallbackTheme = {
  topic: string;
  summary: string;
  patterns: RegExp[];
};

function rankFallbackThemes(items: ParsedWeeklySourceItem[]) {
  const catalog: FallbackTheme[] = [
    {
      topic: "Agent workflows and scaffolding",
      summary:
        "The daily sources repeatedly point toward prompts, tools, skills, plugins, or agent loops as the practical layer where AI value is created or lost.",
      patterns: [/agent/i, /scaffold/i, /prompt/i, /tool/i, /plugin/i, /skill/i, /\bmcp\b/i],
    },
    {
      topic: "Evaluation and reliability",
      summary:
        "Several source notes emphasize checking outputs, controlling failure modes, and making AI systems reliable enough to use repeatedly.",
      patterns: [/eval/i, /reliab/i, /benchmark/i, /test/i, /guardrail/i, /trust/i, /verify/i],
    },
    {
      topic: "AI strategy and economic value",
      summary:
        "The daily coverage links technical capability to career, business, or economic questions without treating those links as forecasts.",
      patterns: [/strategy/i, /economic/i, /value/i, /market/i, /investment/i, /career/i, /business/i],
    },
    {
      topic: "Model capability and limits",
      summary:
        "The week raises questions about what current models can do, where they break down, and how much surrounding structure they still need.",
      patterns: [/model/i, /capabil/i, /frontier/i, /distill/i, /collapse/i, /limit/i],
    },
    {
      topic: "Safety, abuse, and governance",
      summary:
        "Some daily sources focus on misuse, security, safety, or governance issues that should not be converted into claims beyond the transcript evidence.",
      patterns: [/safety/i, /security/i, /abuse/i, /fake account/i, /govern/i, /risk/i, /nuclear/i],
    },
  ];
  const haystacks = items.map((item) =>
    [item.title, item.summary, item.beginner, item.intermediate, item.advanced, item.whyItMatters]
      .join(" ")
      .toLowerCase(),
  );
  const scored = catalog
    .map((theme) => ({
      topic: theme.topic,
      summary: theme.summary,
      score: haystacks.reduce(
        (sum, haystack) =>
          sum + theme.patterns.filter((pattern) => pattern.test(haystack)).length,
        0,
      ),
    }))
    .filter((theme) => theme.score > 0)
    .sort((left, right) => right.score - left.score);

  if (scored.length) return scored;
  return [
    {
      topic: "Source-backed AI coverage",
      summary:
        "The daily digest set provides enough grounded material to recap the week, but not enough repeated keywords for a narrower automatic theme.",
      score: 1,
    },
  ];
}

function buildFallbackTakeaways(primaryTheme: string) {
  return [
    `Use ${primaryTheme.toLowerCase()} as a prompt for one small experiment, not as a broad forecast.`,
    "Keep daily transcript anchors attached when turning the weekly synthesis into a memo or podcast.",
    "Separate practical workflow advice from claims that would require external verification.",
    "Regenerate the week later if provider-backed weekly research becomes available.",
  ];
}

function trimText(value: string, maxLength: number) {
  const cleaned = cleanInlineText(value);
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trim()}...`;
}

function cleanInlineText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildWeeklyGroundingMetadata(input: {
  weekStart: string;
  weekEnd: string;
  sourceDigestCount?: number;
  generationTimestamp: string;
  generationModel: string;
  limitations?: string[];
}) {
  return {
    grounded: (input.sourceDigestCount ?? 0) > 0,
    source: "daily_digests",
    source_digest_count: input.sourceDigestCount ?? 0,
    source_date_range: {
      start: input.weekStart,
      end: input.weekEnd,
    },
    generated_at: input.generationTimestamp,
    generation_model: input.generationModel,
    limitations:
      input.limitations ??
      [
        "Weekly synthesis is grounded in regenerated daily digests and their transcript-grounded source notes.",
      ],
  };
}
