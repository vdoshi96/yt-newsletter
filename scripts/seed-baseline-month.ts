import "./load-env";
import { closeSql, getSql } from "@/lib/db";
import { createUser } from "@/lib/auth/login";
import { startPastMonthBaselineForCreatorUrl } from "@/lib/creators";
import { processIngestQueue } from "@/lib/processor";
import { ensurePastMonthWeeklyDigests } from "@/lib/weekly/baseline";

async function main() {
  const username = process.env.FIRST_ADMIN_USERNAME;
  const password = process.env.FIRST_ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error("FIRST_ADMIN_USERNAME and FIRST_ADMIN_PASSWORD are required.");
  }

  const userId = await ensureAdminUser(username, password);
  const result = await startPastMonthBaselineForCreatorUrl({
    userId,
    creatorUrl: "https://www.youtube.com/@NateBJones",
  });

  console.log(
    `Queued completed-week baseline for Nate B. Jones: ${result.videoCount} video(s), 4 weekly digest slots.`,
  );

  if (process.argv.includes("--process")) {
    await drainQueue();
  }

  await ensurePastMonthWeeklyDigests({
    creatorId: result.creatorId,
    forceRegenerate: process.argv.includes("--process"),
    generateFromSources: process.argv.includes("--process"),
  });
  console.log("Confirmed four baseline weekly digest slots.");
}

async function ensureAdminUser(username: string, password: string) {
  const sql = getSql();
  const existing = await sql<{ id: string }[]>`
    select id from app_users where lower(username) = lower(${username}) limit 1
  `;
  if (existing[0]) return existing[0].id;

  const userId = await createUser({ username, password, role: "admin" });
  if (!userId) throw new Error("Could not create first admin user.");
  return userId;
}

async function drainQueue() {
  const maxLoops = Number(process.env.BASELINE_PROCESS_MAX_LOOPS ?? 40);
  for (let index = 0; index < maxLoops; index += 1) {
    const result = await processIngestQueue();
    if (result.processed === 0) return;
  }
  console.log("Baseline processor stopped at max loop guard. Re-run with --process to continue.");
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSql();
  });
