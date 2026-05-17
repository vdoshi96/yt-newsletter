import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("dashboard counts and weekly scheduling", () => {
  it("counts only recent grounded long-form daily digests on the dashboard", () => {
    const page = readRepoFile("src/app/app/page.tsx");
    const stats = page.slice(page.indexOf("async function getDashboardStats"));

    expect(page).toContain('label="30-day daily digests"');
    expect(stats).toContain("join videos on videos.id = daily_digests.video_id");
    expect(stats).toContain("daily_digests.digest_date >= current_date - make_interval(days => 30)");
    expect(stats).toContain("coalesce(videos.duration_seconds, 0) >= ");
  });

  it("has an explicit Saturday weekly-digest cron route", () => {
    const vercel = readRepoFile("vercel.json");
    const route = readRepoFile("src/app/api/cron/generate-weekly-digest/route.ts");

    expect(vercel).toContain("/api/cron/generate-weekly-digest");
    expect(vercel).toContain("13 * * 6");
    expect(route).toContain("ensureCompletedWeeklyDigestsForCreator");
    expect(route).toContain("maxDuration");
  });

  it("offers the latest published weekly edition instead of the current in-progress week", () => {
    const weeklyPage = readRepoFile("src/app/app/weekly/page.tsx");

    expect(weeklyPage).toContain("latestPublishedWeekStart");
    expect(weeklyPage).toContain("Jump to latest published");
    expect(weeklyPage).not.toContain("Jump to current");
  });
});
