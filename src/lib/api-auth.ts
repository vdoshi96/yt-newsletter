import { NextRequest } from "next/server";

export function requireCronSecret(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return false;
  }
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const header = request.headers.get("x-cron-secret");
  const query = request.nextUrl.searchParams.get("secret");
  return bearer === expected || header === expected || query === expected;
}
