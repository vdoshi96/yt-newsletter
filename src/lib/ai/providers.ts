import { estimateTokens } from "@/lib/ai/usage";
import type { AiProvider, ChatMessage, JsonChatResult } from "@/lib/ai/types";

export async function callChatProvider(input: {
  provider: AiProvider;
  model: string;
  messages: ChatMessage[];
  responseFormat?: "json_object" | "text";
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
}) {
  const { apiKey, baseUrl } = getOpenAiCompatibleConfig(input.provider);
  if (!apiKey) throw new Error(`Missing API key for ${input.provider}.`);

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      temperature: 0.2,
      response_format:
        input.responseFormat === "json_object" ? { type: "json_object" } : undefined,
    }),
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
}

async function callGemini(input: {
  model: string;
  messages: ChatMessage[];
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY.");

  const prompt = input.messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
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
