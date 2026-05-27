import { describe, expect, it } from "vitest";
import { normalizeConcurrency, runBoundedConcurrency } from "../src/lib/concurrency";

describe("runBoundedConcurrency", () => {
  it("keeps result order while limiting active workers", async () => {
    let active = 0;
    let maxActive = 0;
    const results = await runBoundedConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return item * 10;
    });

    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});

describe("normalizeConcurrency", () => {
  it("falls back to one worker for invalid values", () => {
    expect(normalizeConcurrency(0)).toBe(1);
    expect(normalizeConcurrency(Number.NaN)).toBe(1);
  });

  it("floors positive values", () => {
    expect(normalizeConcurrency(3.8)).toBe(3);
  });
});
