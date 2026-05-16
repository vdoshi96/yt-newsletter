import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AI provider safeguards", () => {
  it("bounds chat provider requests and response body reads", () => {
    const providers = readFileSync(join(process.cwd(), "src/lib/ai/providers.ts"), "utf8");

    expect(providers).toContain("createProviderTimeout");
    expect(providers).toContain('numberEnv("AI_PROVIDER_TIMEOUT_MS", 300_000)');
    expect(providers).toContain("signal: timeout.signal");
    expect(providers).toMatch(/await response\.json\(\)[\s\S]+finally\s*{\s*timeout\.cancel\(\);/);
    expect(providers).toContain("request timed out after");
  });

  it("does not send response_format to the Kimi-compatible route", () => {
    const providers = readFileSync(join(process.cwd(), "src/lib/ai/providers.ts"), "utf8");

    expect(providers).toContain("supportsJsonResponseFormat");
    expect(providers).toContain('provider !== "kimi"');
  });

  it("allows weekly generation to request a larger output budget", () => {
    const providers = readFileSync(join(process.cwd(), "src/lib/ai/providers.ts"), "utf8");
    const ai = readFileSync(join(process.cwd(), "src/lib/ai/index.ts"), "utf8");

    expect(providers).toContain("body.max_tokens = input.maxTokens");
    expect(ai).toContain('numberEnv("WEEKLY_AI_MAX_OUTPUT_TOKENS", 12_000)');
  });

  it("uses DeepSeek before Kimi for weekly digest generation", () => {
    const ai = readFileSync(join(process.cwd(), "src/lib/ai/index.ts"), "utf8");
    const weeklyStart = ai.indexOf("export async function generateWeeklyDigestPayload");
    const deepseek = ai.indexOf('{ provider: "deepseek"', weeklyStart);
    const kimi = ai.indexOf('{ provider: "kimi"', weeklyStart);

    expect(weeklyStart).toBeGreaterThan(-1);
    expect(deepseek).toBeGreaterThan(weeklyStart);
    expect(kimi).toBeGreaterThan(deepseek);
  });
});
