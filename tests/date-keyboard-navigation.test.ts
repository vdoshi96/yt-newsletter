import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getAdjacentArchiveValue } from "../src/lib/digests/navigation";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("digest archive navigation", () => {
  it("wires left and right arrow keys to daily and weekly digest neighbors", () => {
    const navigation = readRepoFile("src/components/date-keyboard-navigation.tsx");
    const archiveNavigation = readRepoFile("src/components/digest-archive-navigation.tsx");
    const dailyPage = readRepoFile("src/app/app/daily/page.tsx");
    const weeklyPage = readRepoFile("src/app/app/weekly/page.tsx");

    expect(navigation).toContain('event.key === "ArrowLeft"');
    expect(navigation).toContain('event.key === "ArrowRight"');
    expect(navigation).toContain("isEditableTarget");
    expect(archiveNavigation).toContain("Digest archive navigation");
    expect(archiveNavigation).toContain("ChevronLeft");
    expect(archiveNavigation).toContain("ChevronRight");
    expect(dailyPage).toContain("getAdjacentArchiveValue(selectedDate, availableDates, -1)");
    expect(dailyPage).toContain("getAdjacentArchiveValue(selectedDate, availableDates, 1)");
    expect(weeklyPage).toContain("getAdjacentArchiveValue(selectedWeekStart, availableWeeks, -1)");
    expect(weeklyPage).toContain("getAdjacentArchiveValue(selectedWeekStart, availableWeeks, 1)");
  });

  it("finds previous and next available archive values", () => {
    const values = ["2026-05-05", "2026-05-01", "2026-05-03", "2026-05-03"];

    expect(getAdjacentArchiveValue("2026-05-03", values, -1)).toBe("2026-05-01");
    expect(getAdjacentArchiveValue("2026-05-03", values, 1)).toBe("2026-05-05");
    expect(getAdjacentArchiveValue("2026-05-02", values, -1)).toBe("2026-05-01");
    expect(getAdjacentArchiveValue("2026-05-02", values, 1)).toBe("2026-05-03");
    expect(getAdjacentArchiveValue("2026-05-01", values, -1)).toBeUndefined();
    expect(getAdjacentArchiveValue("2026-05-05", values, 1)).toBeUndefined();
  });
});
