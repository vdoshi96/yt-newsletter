import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/api-auth";
import { processIngestQueue } from "@/lib/processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processIngestQueue();
  return NextResponse.json(result);
}
