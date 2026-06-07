import { describe, expect, it } from "vitest";
import {
  getSaturdayToFridayWeekRange,
  isWeeklyDigestReady,
} from "../src/lib/weekly/week-range";

describe("weekly digest week range", () => {
  it("uses Saturday through Friday windows", () => {
    expect(getSaturdayToFridayWeekRange("2026-05-13T12:00:00Z")).toEqual({
      weekStart: "2026-05-09",
      weekEnd: "2026-05-15",
    });
  });

  it("waits until Saturday morning after the Friday close before publishing the weekly digest", () => {
    const range = getSaturdayToFridayWeekRange("2026-05-13T12:00:00Z");

    expect(isWeeklyDigestReady(range, new Date("2026-05-15T23:59:59Z"))).toBe(false);
    expect(isWeeklyDigestReady(range, new Date("2026-05-16T00:00:00Z"))).toBe(true);
  });

});
