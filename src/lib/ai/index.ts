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
}) {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a careful newspaper editor for smart non-technical learners. Return strict JSON only.",
    },
    {
      role: "user",
      content: `${input.prompt}\n\nVIDEO TITLE:\n${input.title}\n\nSOURCE TYPE:\n${input.transcriptSource}\n\nSOURCE TEXT:\n${input.transcriptOrNotes}`,
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

  return weeklyDigestSchema.parse({
    title: "Weekly digest",
    newsletter_markdown: `# Weekly digest\n\n${input.sourceText.slice(0, 3000)}`,
    ranked_topics: [],
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
