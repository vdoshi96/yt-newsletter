import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/api-auth";
import { processIngestQueue, refreshCreatorsAndProcessQueue } from "@/lib/processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shouldDiscover = request.nextUrl.searchParams.get("discover") !== "0";
  const result = shouldDiscover
    ? await refreshCreatorsAndProcessQueue()
    : await processIngestQueue();
  return NextResponse.json(result);
}
