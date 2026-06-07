import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("weekly archive pages", () => {
  it("does not cap weekly digests to the initial four baseline weeks", () => {
    const weeklyPage = readFileSync(join(process.cwd(), "src/app/app/weekly/page.tsx"), "utf8");

    expect(weeklyPage).not.toMatch(/limit\s+4/i);
    expect(weeklyPage).not.toContain("Four weekly digests");
  });
});
