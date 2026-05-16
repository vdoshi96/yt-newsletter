import { numberEnv } from "@/lib/config";
import { estimateTokens } from "@/lib/ai/usage";
import type { AiProvider, ChatMessage, JsonChatResult } from "@/lib/ai/types";

export async function callChatProvider(input: {
  provider: AiProvider;
  model: string;
  messages: ChatMessage[];
  responseFormat?: "json_object" | "text";
  maxTokens?: number;
}): Promise<JsonChatResult> {
  if (input.provider === "gemini") {
    return callGemini(input);
  }
  return callOpenAiCompatible(input);
}

async function callOpenAiCompatible(input: {
  provider: AiProvider;
  model: string;
  messages: ChatMessage[];
  responseFormat?: "json_object" | "text";
  maxTokens?: number;
}) {
  const { apiKey, baseUrl } = getOpenAiCompatibleConfig(input.provider);
  if (!apiKey) throw new Error(`Missing API key for ${input.provider}.`);
  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    temperature: 0.2,
  };
  if (input.responseFormat === "json_object" && supportsJsonResponseFormat(input.provider)) {
    body.response_format = { type: "json_object" };
  }
  if (input.maxTokens) {
    body.max_tokens = input.maxTokens;
  }

  const timeout = createProviderTimeout();
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

    if (!response.ok) {
      throw new Error(`${input.provider} request failed: ${response.status}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = json.choices?.[0]?.message?.content ?? "";
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

async function callGemini(input: {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY.");

  const prompt = input.messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
  const timeout = createProviderTimeout();
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: timeout.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            maxOutputTokens: input.maxTokens,
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini request failed: ${response.status}`);
    }

    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    return {
      text,
      inputTokens: json.usageMetadata?.promptTokenCount ?? estimateTokens(prompt),
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? estimateTokens(text),
      estimatedCostUsd: null,
    };
  } catch (error) {
    throw normalizeProviderError("gemini", error, timeout.timeoutMs);
  } finally {
    timeout.cancel();
  }
}

function createProviderTimeout() {
  const timeoutMs = numberEnv("AI_PROVIDER_TIMEOUT_MS", 300_000);
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
