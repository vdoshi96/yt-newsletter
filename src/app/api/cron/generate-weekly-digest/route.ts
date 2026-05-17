import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/api-auth";
import { getSql } from "@/lib/db";
import { ensureCompletedWeeklyDigestsForCreator } from "@/lib/weekly/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

type CreatorRow = {
  creator_id: string;
};

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forceRegenerate =
    request.nextUrl.searchParams.get("force") === "1" ||
    request.nextUrl.searchParams.get("force") === "true";
  const creators = await getCreatorsWithUsers();
  const weekDigestIds: string[] = [];
  let creatorsFailed = 0;

  for (const creator of creators) {
    try {
      const result = await ensureCompletedWeeklyDigestsForCreator({
        creatorId: creator.creator_id,
        forceRegenerate,
      });
      weekDigestIds.push(...result.weekDigestIds);
      console.info("[weekly-cron:creator-finished]", {
        creatorId: creator.creator_id,
        weekCount: result.weekCount,
        forceRegenerate,
      });
    } catch (error) {
      creatorsFailed += 1;
      console.error("[weekly-cron:creator-failed]", {
        creatorId: creator.creator_id,
        message: (error as Error).message,
      });
    }
  }

  return NextResponse.json({
    creatorsChecked: creators.length,
    creatorsFailed,
    weekCount: weekDigestIds.length,
    weekDigestIds,
    forceRegenerate,
  });
}

async function getCreatorsWithUsers() {
  const sql = getSql();
  return sql<CreatorRow[]>`
    select distinct creators.id as creator_id
    from creators
    join user_creators on user_creators.creator_id = creators.id
    where creators.channel_url is not null
    order by creators.id asc
  `;
}
