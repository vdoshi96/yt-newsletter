import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("DeepSeek V4 Pro routing", () => {
  it("uses the explicit V4 Pro model for primary daily and weekly generation", () => {
    const ai = readRepoFile("src/lib/ai/index.ts");

    expect(ai).toContain('process.env.DEEPSEEK_DAILY_MODEL ?? "deepseek-v4-pro"');
    expect(ai).toContain('process.env.DEEPSEEK_WEEKLY_MODEL ?? "deepseek-v4-pro"');
    expect(ai).not.toContain('process.env.DEEPSEEK_DAILY_MODEL ?? "deepseek-chat"');
    expect(ai).not.toContain('process.env.DEEPSEEK_WEEKLY_FALLBACK_MODEL ?? "deepseek-chat"');
  });

  it("enables DeepSeek thinking mode and does not hide response bodies on provider errors", () => {
    const providers = readRepoFile("src/lib/ai/providers.ts");

    expect(providers).toContain('body.thinking = { type: "enabled" }');
    expect(providers).toContain('body.reasoning_effort = input.reasoningEffort ?? "high"');
    expect(providers).toContain("await response.text()");
    expect(providers).toContain("truncateProviderBody");
  });

  it("retries the primary DeepSeek route before falling back to weaker providers", () => {
    const ai = readRepoFile("src/lib/ai/index.ts");

    expect(ai).toContain("attempts: numberEnv(\"DEEPSEEK_DAILY_MAX_ATTEMPTS\", 2)");
    expect(ai).toContain("attempts: numberEnv(\"DEEPSEEK_WEEKLY_MAX_ATTEMPTS\", 3)");
    expect(ai).toContain("runProviderRoute");
    expect(ai).toContain("Daily digest provider failed");
    expect(ai).toContain("Weekly digest provider failed");
  });
});
