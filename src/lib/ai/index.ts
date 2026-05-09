import { dailyDigestSchema, weeklyDigestSchema } from "@/lib/digests/schemas";
import { callChatProvider } from "@/lib/ai/providers";
import { parseJsonFromModel, localDigestFallback } from "@/lib/ai/json";
import { logModelUsage } from "@/lib/ai/usage";
import type { AiCallContext, AiProvider, ChatMessage } from "@/lib/ai/types";

export async function generateDailyDigestPayload(input: {
  creatorId: string;
  videoId: string;
  title: string;
  transcriptOrNotes: string;
  transcriptSource: string;
  prompt: string;
  previousDailyContext?: string;
}) {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a careful newspaper editor for smart non-technical learners. Return strict JSON only.",
    },
    {
      role: "user",
      content:
        `${input.prompt}\n\nVIDEO TITLE:\n${input.title}\n\nSOURCE TYPE:\n${input.transcriptSource}` +
        `\n\nPREVIOUS DAILY DIGEST CONTEXT:\n${input.previousDailyContext ?? "No prior daily digest is available for this creator."}` +
        `\n\nSOURCE TEXT:\n${input.transcriptOrNotes}`,
    },
  ];

  const route: Array<{ provider: AiProvider; model: string }> = [
    { provider: "deepseek", model: process.env.DEEPSEEK_DAILY_MODEL ?? "deepseek-chat" },
    { provider: "qwen", model: process.env.QWEN_DAILY_FALLBACK_MODEL ?? "qwen-plus" },
  ];

  for (const option of route) {
    try {
      const result = await callChatProvider({
        ...option,
        messages,
        responseFormat: "json_object",
      });
      await logModelUsage(
        {
          provider: option.provider,
          model: option.model,
          taskType: "daily_structured_digest",
          creatorId: input.creatorId,
          videoId: input.videoId,
        },
        result,
      );
      return dailyDigestSchema.parse(parseJsonFromModel(result.text));
    } catch (error) {
      console.warn(`Daily digest provider failed: ${(error as Error).message}`);
    }
  }

  return dailyDigestSchema.parse(
    localDigestFallback({
      title: input.title,
      transcriptOrNotes: input.transcriptOrNotes,
      transcriptSource: input.transcriptSource,
    }),
  );
}

export async function generateWeeklyDigestPayload(input: {
  creatorId: string;
  weekStart: string;
  weekEnd: string;
  sourceText: string;
  prompt: string;
}) {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a careful weekly newsletter editor. Return strict JSON only and mark uncertainty.",
    },
    {
      role: "user",
      content: `${input.prompt}\n\nWEEK: ${input.weekStart} to ${input.weekEnd}\n\nSOURCE DIGESTS:\n${input.sourceText}`,
    },
  ];

  const route: Array<{ provider: AiProvider; model: string }> = [
    { provider: "kimi", model: process.env.KIMI_WEEKLY_MODEL ?? "moonshot-v1-32k" },
    { provider: "deepseek", model: process.env.DEEPSEEK_WEEKLY_FALLBACK_MODEL ?? "deepseek-chat" },
  ];

  for (const option of route) {
    try {
      const result = await callChatProvider({
        ...option,
        messages,
        responseFormat: "json_object",
      });
      await logModelUsage(
        {
          provider: option.provider,
          model: option.model,
          taskType: "weekly_digest",
          creatorId: input.creatorId,
        },
        result,
      );
      return weeklyDigestSchema.parse(parseJsonFromModel(result.text));
    } catch (error) {
      console.warn(`Weekly digest provider failed: ${(error as Error).message}`);
    }
  }

  const fallbackTitles = Array.from(input.sourceText.matchAll(/^Title:\s*(.+)$/gm))
    .map((match) => match[1])
    .slice(0, 8);
  const fallbackDates = Array.from(input.sourceText.matchAll(/^Date:\s*(.+)$/gm)).map(
    (match) => match[1],
  );
  const weeklyPosts = Array.from({ length: 10 }, (_, index) => {
    const title = fallbackTitles[index % Math.max(fallbackTitles.length, 1)];
    const date = fallbackDates[index % Math.max(fallbackDates.length, 1)] ?? input.weekStart;
    const type = index < fallbackTitles.length ? "video" : index % 2 === 0 ? "guide" : "research";
    return {
      date,
      type,
      title: title ?? `Source-backed AI item ${index + 1}`,
      summary:
        index < fallbackTitles.length
          ? "A cached daily digest from this week. Provider fallback mode keeps the item grounded in saved daily text."
          : "A weekly learning item generated from the saved digest context because external provider output was unavailable.",
      why_it_matters:
        "It helps readers track the week without pretending to have unsupported market or technical evidence.",
    };
  });

  return weeklyDigestSchema.parse({
    title: `Weekly digest: ${input.weekStart} to ${input.weekEnd}`,
    newsletter_markdown:
      `# Weekly digest: ${input.weekStart} to ${input.weekEnd}\n\n` +
      "This source-backed fallback was generated because the configured weekly providers returned invalid JSON. It avoids adding unsupported claims and uses the cached daily digest text only.\n\n" +
      "## Videos covered\n\n" +
      (fallbackTitles.length
        ? fallbackTitles.map((title) => `- ${title}`).join("\n")
        : "- No daily digest titles were available.") +
      "\n\n## Source-backed recap\n\n" +
      input.sourceText.slice(0, 2600),
    executive_insights_memo:
      "Weekly provider output was unavailable, so this memo stays conservative while still giving operators a useful frame. Treat the week as a set of source-backed creator themes rather than a fully researched market call. The immediate executive question is which themes are recurring enough to deserve a small experiment, which claims need stronger evidence, and which workflows would create measurable value if they became repeatable. Regenerate this digest with the full provider stack when credentials and model routes are healthy to restore deeper market and board-level synthesis.",
    board_level_implications: [
      "Ask what claims are directly supported by the daily digests before turning them into strategy.",
      "Separate workflow value, infrastructure cost, and model capability when discussing AI investments.",
    ],
    market_investment_lens:
      "No date-scoped external market research was available in fallback mode, so this section avoids unsupported investment claims. The useful market read is narrower: the cached daily digests can still show which operational problems kept appearing, such as workflow reliability, cost, evaluation, adoption friction, or infrastructure pressure. Those repeated problems are often better signals than isolated product announcements because they point to budgets, tooling gaps, and buyer pain that may persist beyond a single news cycle.\n\nFor practical interpretation, treat this as an ecosystem map rather than a recommendation. If several daily digests point toward evaluation and deployment discipline, the likely implication is demand for tooling that makes AI systems more observable, controllable, and cost-aware. If the week instead centers on model capability, the implication may be different: faster experimentation, shifting vendor comparisons, or pressure on teams to revisit build-versus-buy decisions. Without external research, the safest conclusion is directional, not predictive.",
    weekly_posts: weeklyPosts,
    research_briefs: [
      {
        title: "Provider fallback limits",
        thesis:
          "The app can preserve a weekly archive even when the preferred weekly model route fails, but deeper research should be regenerated with the full provider stack before treating the brief as a complete market read.",
        evidence: ["Cached daily digest text", "Weekly provider route returned unusable JSON"],
        implications: [
          "Readers still get a grounded archive of what the creator covered, which protects continuity when providers fail.",
          "Strategy, market, and investment interpretation should remain conservative until the richer weekly model route and any date-scoped research notes are available.",
          "A useful verification path is to inspect the daily digests, confirm the recurring themes, then regenerate the weekly edition once provider output is healthy.",
        ],
        uncertainty:
          "The fallback does not include independent market research, so it should not be read as a comprehensive external evidence review.",
      },
    ],
    source_notes: fallbackDates.slice(0, 10).map((date, index) => ({
      date,
      label: fallbackTitles[index] ?? `Daily digest ${index + 1}`,
      note: "Cached daily digest used as fallback source context.",
    })),
    explanation_levels: {
      beginner:
        "This week is summarized from the saved daily digests only. The app is not adding outside claims; it is grouping the creator's covered ideas into a simpler recap.",
      intermediate:
        "This fallback weekly view consolidates the cached daily beginner, intermediate, and advanced explanations without adding unsupported facts.",
      advanced:
        "The weekly provider route returned unusable output, so this fallback preserves source-grounded daily digest material and defers deeper cross-week synthesis until regeneration succeeds.",
    },
    ranked_topics: fallbackTitles.slice(0, 5).map((title, index) => ({
      topic: title,
      importance_score: Math.max(0.1, 1 - index * 0.12),
      why_it_matters: "This was one of the source-backed daily digest themes for the week.",
    })),
    what_changed:
      "Provider calls were unavailable, so this fallback summarizes only the cached daily digest text.",
    what_to_do_next: ["Review the daily digests and choose one free mini-project."],
    free_learning_plan: ["Use free docs and official examples before optional paid material."],
    podcast_script: "This week's audio script is unavailable until AI providers are configured.",
  });
}

export async function generateGeminiVideoNotes(input: {
  creatorId: string;
  videoId: string;
  youtubeUrl: string;
}) {
  const model = process.env.GEMINI_VIDEO_MODEL ?? "gemini-2.5-flash";
  const context: AiCallContext = {
    provider: "gemini",
    model,
    taskType: "video_fallback_notes",
    creatorId: input.creatorId,
    videoId: input.videoId,
  };
  const result = await callChatProvider({
    provider: "gemini",
    model,
    responseFormat: "json_object",
    messages: [
      {
        role: "user",
        content:
          `The public YouTube URL is ${input.youtubeUrl}.\n` +
          "If you can analyze it, return JSON with keys summary_notes, uncertainty, and key_moments. " +
          "Do not call this a transcript. If you cannot access the video, say so clearly.",
      },
    ],
  });
  await logModelUsage(context, result);
  return parseJsonFromModel<Record<string, unknown>>(result.text);
}
