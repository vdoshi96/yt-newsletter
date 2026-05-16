import { describe, expect, it } from "vitest";
import {
  getPastMonthBaselineWindow,
  isBaselineMainVideo,
} from "../src/lib/baseline/month";

describe("past-month baseline window", () => {
  it("creates exactly four seven-day weekly digest windows", () => {
    const baseline = getPastMonthBaselineWindow(new Date("2026-05-09T15:00:00Z"));

    expect(baseline.weekCount).toBe(4);
    expect(baseline.windows).toEqual([
      { weekStart: "2026-04-11", weekEnd: "2026-04-17" },
      { weekStart: "2026-04-18", weekEnd: "2026-04-24" },
      { weekStart: "2026-04-25", weekEnd: "2026-05-01" },
      { weekStart: "2026-05-02", weekEnd: "2026-05-08" },
    ]);
  });

  it("filters videos to the four-week baseline period inclusively", () => {
    const baseline = getPastMonthBaselineWindow(new Date("2026-05-09T15:00:00Z"));

    expect(baseline.includesPublishedAt("2026-04-10T23:59:59Z")).toBe(false);
    expect(baseline.includesPublishedAt("2026-04-11T00:00:00Z")).toBe(true);
    expect(baseline.includesPublishedAt("2026-05-08T23:59:59Z")).toBe(true);
    expect(baseline.includesPublishedAt("2026-05-09T00:00:00Z")).toBe(false);
  });

  it("treats long-form uploads as baseline main videos and filters Shorts-like clips", () => {
    expect(isBaselineMainVideo({ duration_seconds: 1841, title: "Main upload" })).toBe(true);
    expect(isBaselineMainVideo({ duration_seconds: 70, title: "Short #shorts" })).toBe(false);
    expect(isBaselineMainVideo({ duration_seconds: 134, title: "Shorts-style clip" })).toBe(false);
  });
});
