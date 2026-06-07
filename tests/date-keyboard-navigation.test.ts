import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("digest date keyboard navigation", () => {
  it("wires left and right arrow keys to daily and weekly digest dates", () => {
    const navigation = readRepoFile("src/components/date-keyboard-navigation.tsx");
    const dailyPage = readRepoFile("src/app/app/daily/page.tsx");
    const weeklyPage = readRepoFile("src/app/app/weekly/page.tsx");

    expect(navigation).toContain('event.key === "ArrowLeft"');
    expect(navigation).toContain('event.key === "ArrowRight"');
    expect(navigation).toContain("isEditableTarget");
    expect(dailyPage).toContain("shiftIsoDate(selectedDate, -1)");
    expect(dailyPage).toContain("shiftIsoDate(selectedDate, 1)");
    expect(weeklyPage).toContain("shiftIsoDate(selectedWeekStart, -7)");
    expect(weeklyPage).toContain("shiftIsoDate(selectedWeekStart, 7)");
  });
});
