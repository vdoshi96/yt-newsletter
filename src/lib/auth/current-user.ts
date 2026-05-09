import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSql } from "@/lib/db";
import type { AppUser } from "@/lib/types";
import { SESSION_COOKIE_NAME, hashSessionToken } from "@/lib/auth/session";

export async function getCurrentUser(): Promise<AppUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const sql = getSql();
  const tokenHash = hashSessionToken(token);
  const rows = await sql<AppUser[]>`
    select app_users.id, app_users.username, app_users.role
    from sessions
    join app_users on app_users.id = sessions.user_id
    where sessions.session_token_hash = ${tokenHash}
      and sessions.expires_at > now()
    limit 1
  `;

  return rows[0] ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
