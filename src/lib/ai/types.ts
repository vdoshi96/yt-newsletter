export type AiProvider = "deepseek" | "qwen" | "kimi";

export type AiTaskType =
  | "daily_structured_digest"
  | "daily_plain_english_explanation"
  | "weekly_digest"
  | "dashboard_image";

export type AiCallContext = {
  provider: AiProvider;
  model: string;
  taskType: AiTaskType;
  creatorId?: string | null;
  videoId?: string | null;
  weeklyDigestId?: string | null;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type JsonChatResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number | null;
};
