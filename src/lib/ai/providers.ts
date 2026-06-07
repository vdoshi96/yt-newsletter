import { numberEnv } from "@/lib/config";
import { estimateTokens } from "@/lib/ai/usage";
import type { AiProvider, ChatMessage, JsonChatResult } from "@/lib/ai/types";

export async function callChatProvider(input: {
  provider: AiProvider;
  model: string;
  messages: ChatMessage[];
  responseFormat?: "json_object" | "text";
  maxTokens?: number;
  reasoningEffort?: "high" | "max";
  timeoutMs?: number;
}): Promise<JsonChatResult> {
  return callOpenAiCompatible(input);
}

async function callOpenAiCompatible(input: {
  provider: AiProvider;
  model: string;
  messages: ChatMessage[];
  responseFormat?: "json_object" | "text";
  maxTokens?: number;
  reasoningEffort?: "high" | "max";
  timeoutMs?: number;
}) {
  const { apiKey, baseUrl } = getOpenAiCompatibleConfig(input.provider);
  if (!apiKey) throw new Error(`Missing API key for ${input.provider}.`);
  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
  };
  if (usesDeepSeekThinking(input.provider, input.model)) {
    body.thinking = { type: "enabled" };
    body.reasoning_effort = input.reasoningEffort ?? "high";
  } else if (input.provider === "kimi") {
    body.temperature = 1;
  } else {
    body.temperature = 0.2;
  }
  if (input.responseFormat === "json_object" && supportsJsonResponseFormat(input.provider)) {
    body.response_format = { type: "json_object" };
  }
  if (input.maxTokens) {
    body.max_tokens = input.maxTokens;
  }

  const timeout = createProviderTimeout(input.provider, input.timeoutMs);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      signal: timeout.signal,
      body: JSON.stringify(body),
    });
    const responseBody = await response.text();

    if (!response.ok) {
      throw new Error(
        `${input.provider}:${input.model} request failed: ${response.status} ${truncateProviderBody(responseBody)}`,
      );
    }

    const json = JSON.parse(responseBody) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) {
      throw new Error(`${input.provider}:${input.model} returned empty content.`);
    }
    return {
      text,
      inputTokens: json.usage?.prompt_tokens ?? estimateTokens(JSON.stringify(input.messages)),
      outputTokens: json.usage?.completion_tokens ?? estimateTokens(text),
      estimatedCostUsd: null,
    };
  } catch (error) {
    throw normalizeProviderError(input.provider, error, timeout.timeoutMs);
  } finally {
    timeout.cancel();
  }
}

function createProviderTimeout(provider: AiProvider, overrideMs?: number) {
  const timeoutMs =
    overrideMs ??
    (provider === "deepseek"
      ? numberEnv("DEEPSEEK_PROVIDER_TIMEOUT_MS", numberEnv("AI_PROVIDER_TIMEOUT_MS", 600_000))
      : numberEnv("AI_PROVIDER_TIMEOUT_MS", 300_000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    timeoutMs,
    cancel: () => clearTimeout(timer),
  };
}

function normalizeProviderError(provider: AiProvider, error: unknown, timeoutMs: number) {
  if (error instanceof Error && error.name === "AbortError") {
    return new Error(`${provider} request timed out after ${timeoutMs}ms`);
  }
  return error instanceof Error ? error : new Error(`${provider} request failed`);
}

function supportsJsonResponseFormat(provider: AiProvider) {
  return provider !== "kimi";
}

function usesDeepSeekThinking(provider: AiProvider, model: string) {
  return provider === "deepseek" && model.startsWith("deepseek-v4-");
}

function truncateProviderBody(body: string) {
  const cleaned = body.replace(/\s+/g, " ").trim();
  if (!cleaned) return "(empty response body)";
  return cleaned.length > 500 ? `${cleaned.slice(0, 500)}...` : cleaned;
}

function getOpenAiCompatibleConfig(provider: AiProvider) {
  if (provider === "deepseek") {
    return {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    };
  }
  if (provider === "kimi") {
    return {
      apiKey: process.env.KIMI_API_KEY,
      baseUrl: process.env.KIMI_BASE_URL ?? "https://api.moonshot.ai/v1",
    };
  }
  return {
    apiKey: process.env.QWEN_API_KEY ?? process.env.DASHSCOPE_API_KEY,
    baseUrl:
      process.env.QWEN_OPENAI_COMPATIBLE_BASE_URL ??
      process.env.DASHSCOPE_OPENAI_COMPATIBLE_BASE_URL ??
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
  };
}
