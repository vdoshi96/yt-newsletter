import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/api-auth";
import { generateDueWeeklyPodcasts } from "@/lib/podcasts/generate-audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

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

  const force =
    request.nextUrl.searchParams.get("force") === "1" ||
    request.nextUrl.searchParams.get("force") === "true";
  const includeNotReady =
    request.nextUrl.searchParams.get("includeNotReady") === "1" ||
    request.nextUrl.searchParams.get("includeNotReady") === "true";
  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined;
  const week = request.nextUrl.searchParams.get("week");

  const result = await generateDueWeeklyPodcasts({
    force,
    includeNotReady,
    limit,
    week,
  });
  return NextResponse.json(result);
}
