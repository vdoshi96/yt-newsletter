import { describe, expect, it } from "vitest";
import { digestDateFromPublishedAt } from "../src/lib/digests/date";

describe("digestDateFromPublishedAt", () => {
  it("accepts ISO strings and Date objects from postgres", () => {
    expect(digestDateFromPublishedAt("2026-05-08T12:34:56.000Z")).toBe("2026-05-08");
    expect(digestDateFromPublishedAt(new Date("2026-05-08T12:34:56.000Z"))).toBe("2026-05-08");
  });

  it("falls back to today for missing values", () => {
    expect(digestDateFromPublishedAt(null, new Date("2026-05-09T01:00:00.000Z"))).toBe(
      "2026-05-09",
    );
  });
});
