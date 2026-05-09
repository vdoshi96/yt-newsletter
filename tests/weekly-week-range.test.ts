import { describe, expect, it } from "vitest";
import {
  getSundayToSaturdayWeekRange,
  isWeeklyDigestReady,
} from "../src/lib/weekly/week-range";

describe("weekly digest week range", () => {
  it("uses Sunday through Saturday windows", () => {
    expect(getSundayToSaturdayWeekRange("2026-05-13T12:00:00Z")).toEqual({
      weekStart: "2026-05-10",
      weekEnd: "2026-05-16",
    });
  });

  it("waits until Saturday before publishing the weekly digest", () => {
    const range = getSundayToSaturdayWeekRange("2026-05-13T12:00:00Z");

    expect(isWeeklyDigestReady(range, new Date("2026-05-15T23:59:59Z"))).toBe(false);
    expect(isWeeklyDigestReady(range, new Date("2026-05-16T00:00:00Z"))).toBe(true);
  });
});
