import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AI provider safeguards", () => {
  it("bounds chat provider requests and response body reads", () => {
    const providers = readFileSync(join(process.cwd(), "src/lib/ai/providers.ts"), "utf8");

    expect(providers).toContain("createProviderTimeout");
    expect(providers).toContain("signal: timeout.signal");
    expect(providers).toMatch(/await response\.json\(\)[\s\S]+finally\s*{\s*timeout\.cancel\(\);/);
    expect(providers).toContain("request timed out after");
  });

  it("does not send response_format to the Kimi-compatible route", () => {
    const providers = readFileSync(join(process.cwd(), "src/lib/ai/providers.ts"), "utf8");

    expect(providers).toContain("supportsJsonResponseFormat");
    expect(providers).toContain('provider !== "kimi"');
  });
});
