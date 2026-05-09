import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getSql } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  getSecureCookieOptions,
  getSessionExpiry,
  hashSessionToken,
} from "@/lib/auth/session";

const LOCKOUT_WINDOW_MINUTES = 15;
const MAX_FAILED_ATTEMPTS = 8;

export async function authenticateUsernamePassword(input: {
  username: string;
  password: string;
  ipAddress?: string | null;
}) {
  const username = input.username.trim();
  const ipHash = hashIp(input.ipAddress);
  const sql = getSql();

  if (!username || !input.password) {
    await recordLoginAttempt(username, ipHash, false);
    return { ok: false as const, error: "Enter a username and password." };
  }

  if (await isLockedOut(username, ipHash)) {
    await recordLoginAttempt(username, ipHash, false);
    return {
      ok: false as const,
      error: "Too many failed attempts. Wait a few minutes and try again.",
    };
  }

  const users = await sql<{ id: string; password_hash: string }[]>`
    select id, password_hash
    from app_users
    where lower(username) = lower(${username})
    limit 1
  `;
  const user = users[0];
  const verified = user ? await verifyPassword(user.password_hash, input.password) : false;

  await recordLoginAttempt(username, ipHash, verified);

  if (!user || !verified) {
    return { ok: false as const, error: "Invalid username or password." };
  }

  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = getSessionExpiry();
  await sql`
    insert into sessions (user_id, session_token_hash, expires_at)
    values (${user.id}, ${tokenHash}, ${expiresAt.toISOString()})
  `;

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    ...getSecureCookieOptions(),
    expires: expiresAt,
  });

  return { ok: true as const };
}

export async function logoutCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const sql = getSql();
    await sql`
      delete from sessions
      where session_token_hash = ${hashSessionToken(token)}
    `;
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function createUser(input: {
  username: string;
  password: string;
  role?: "admin" | "user";
}) {
  const sql = getSql();
  const passwordHash = await hashPassword(input.password);
  const rows = await sql<{ id: string }[]>`
    insert into app_users (username, password_hash, role)
    values (${input.username.trim()}, ${passwordHash}, ${input.role ?? "user"})
    on conflict (username) do update set
      password_hash = excluded.password_hash,
      role = excluded.role,
      updated_at = now()
    returning id
  `;
  return rows[0]?.id;
}

async function recordLoginAttempt(username: string, ipHash: string, success: boolean) {
  const sql = getSql();
  await sql`
    insert into login_attempts (username, ip_hash, success)
    values (${username}, ${ipHash}, ${success})
  `;
}

async function isLockedOut(username: string, ipHash: string) {
  const sql = getSql();
  const rows = await sql<{ failed_count: number }[]>`
    select count(*)::int as failed_count
    from login_attempts
    where success = false
      and created_at > now() - (${LOCKOUT_WINDOW_MINUTES} || ' minutes')::interval
      and (lower(username) = lower(${username}) or ip_hash = ${ipHash})
  `;
  return (rows[0]?.failed_count ?? 0) >= MAX_FAILED_ATTEMPTS;
}

function hashIp(ipAddress?: string | null) {
  const secret = process.env.COOKIE_SECRET ?? "local-cookie-secret-for-tests-only";
  return crypto.createHmac("sha256", secret).update(ipAddress ?? "unknown").digest("hex");
}
