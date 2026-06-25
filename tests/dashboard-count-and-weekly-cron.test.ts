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

  it("keeps production cron schedules paused with restart instructions preserved", () => {
    const vercelConfig = JSON.parse(readRepoFile("vercel.json")) as { crons?: unknown[] };
    const operations = readRepoFile("docs/wiki/operations.md");

    expect(vercelConfig.crons).toEqual([]);
    expect(operations).toContain("/api/cron/process-ingest`: `*/5 * * * *`");
    expect(operations).toContain("/api/cron/check-creators`: `2 * * * *`");
    expect(operations).toContain("/api/cron/generate-weekly-digest`: `13 13 * * 6`");
  });

  it("keeps the Saturday weekly-digest route restartable", () => {
    const route = readRepoFile("src/app/api/cron/generate-weekly-digest/route.ts");

    expect(route).toContain("ensureCompletedWeeklyDigestsForCreator");
    expect(route).toContain("maxDuration");
  });

  it("keeps weekly generation out of daily discovery and process cron paths", () => {
    const processor = readRepoFile("src/lib/processor.ts");
    const processRoute = readRepoFile("src/app/api/cron/process-ingest/route.ts");
    const discoveryRoute = readRepoFile("src/app/api/cron/check-creators/route.ts");

    expect(processRoute).not.toContain("ensureCompletedWeeklyDigestsForCreator");
    expect(discoveryRoute).not.toContain("ensureCompletedWeeklyDigestsForCreator");
    expect(processor).not.toContain("weekly-availability-checked");
  });

  it("keeps daily process route budget above DeepSeek generation timeout", () => {
    const processRoute = readRepoFile("src/app/api/cron/process-ingest/route.ts");
    const adminRoute = readRepoFile("src/app/api/admin/run-ingest-now/route.ts");
    const config = readRepoFile("src/lib/config.ts");

    expect(processRoute).toContain("maxDuration = 800");
    expect(adminRoute).toContain("maxDuration = 800");
    expect(config).toContain('DEEPSEEK_PROVIDER_TIMEOUT_MS: "600000"');
  });

  it("offers the latest published weekly edition instead of the current in-progress week", () => {
    const weeklyPage = readRepoFile("src/app/app/weekly/page.tsx");

    expect(weeklyPage).toContain("latestPublishedWeekStart");
    expect(weeklyPage).toContain("Jump to latest published");
    expect(weeklyPage).not.toContain("Jump to current");
  });

  it("keeps the weekly podcast cron retired", () => {
    const vercel = readRepoFile("vercel.json");
    const nav = readRepoFile("src/components/app-nav.tsx");

    expect(vercel).not.toContain("/api/cron/generate-weekly-podcast");
    expect(nav).not.toContain("/app/podcasts");
  });
});
