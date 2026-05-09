import { describe, expect, it } from "vitest";
import {
  getCurrentSundayWeekStart,
  resolveSelectedWeekStart,
} from "../src/lib/weekly/navigation";

describe("weekly calendar navigation", () => {
  it("defaults to the latest available week before falling back to current week", () => {
    expect(resolveSelectedWeekStart(undefined, ["2026-04-26", "2026-05-03"], new Date("2026-05-09T12:00:00Z"))).toBe(
      "2026-05-03",
    );
    expect(resolveSelectedWeekStart(undefined, [], new Date("2026-05-09T12:00:00Z"))).toBe(
      "2026-05-03",
    );
  });

  it("normalizes any selected date to the app's Sunday-to-Saturday week", () => {
    expect(resolveSelectedWeekStart("2026-05-09", [], new Date("2026-05-10T12:00:00Z"))).toBe(
      "2026-05-03",
    );
    expect(getCurrentSundayWeekStart(new Date("2026-05-09T12:00:00Z"))).toBe("2026-05-03");
  });
});
