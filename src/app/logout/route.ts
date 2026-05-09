import { redirect } from "next/navigation";
import { logoutCurrentSession } from "@/lib/auth/login";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await logoutCurrentSession();
  redirect("/login");
}
