import { describe, expect, it } from "vitest";
import { getPastMonthBaselineWindow } from "../src/lib/baseline/month";

describe("past-month baseline window", () => {
  it("creates exactly four seven-day weekly digest windows", () => {
    const baseline = getPastMonthBaselineWindow(new Date("2026-05-09T15:00:00Z"));

    expect(baseline.weekCount).toBe(4);
    expect(baseline.windows).toEqual([
      { weekStart: "2026-04-12", weekEnd: "2026-04-18" },
      { weekStart: "2026-04-19", weekEnd: "2026-04-25" },
      { weekStart: "2026-04-26", weekEnd: "2026-05-02" },
      { weekStart: "2026-05-03", weekEnd: "2026-05-09" },
    ]);
  });

  it("filters videos to the four-week baseline period inclusively", () => {
    const baseline = getPastMonthBaselineWindow(new Date("2026-05-09T15:00:00Z"));

    expect(baseline.includesPublishedAt("2026-04-11T23:59:59Z")).toBe(false);
    expect(baseline.includesPublishedAt("2026-04-12T00:00:00Z")).toBe(true);
    expect(baseline.includesPublishedAt("2026-05-09T23:59:59Z")).toBe(true);
    expect(baseline.includesPublishedAt("2026-05-10T00:00:00Z")).toBe(false);
  });
});
