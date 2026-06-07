import { describe, expect, it } from "vitest";
import {
  resolveSelectedWeekStart,
} from "../src/lib/weekly/navigation";

describe("weekly calendar navigation", () => {
  it("defaults to the latest available week before falling back to current week", () => {
    expect(resolveSelectedWeekStart(undefined, ["2026-04-25", "2026-05-02"], new Date("2026-05-09T12:00:00Z"))).toBe(
      "2026-05-02",
    );
    expect(resolveSelectedWeekStart(undefined, [], new Date("2026-05-09T12:00:00Z"))).toBe(
      "2026-05-09",
    );
  });

  it("normalizes any selected date to the app's Saturday-to-Friday week", () => {
    expect(resolveSelectedWeekStart("2026-05-09", [], new Date("2026-05-10T12:00:00Z"))).toBe(
      "2026-05-09",
    );
  });
});
