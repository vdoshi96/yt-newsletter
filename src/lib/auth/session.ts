import crypto from "node:crypto";

export const SESSION_COOKIE_NAME = "yt_newsletter_session";
export const SESSION_DURATION_DAYS = 14;

export function createSessionToken() {
  return crypto.randomBytes(48).toString("base64url");
}

export function hashSessionToken(token: string) {
  const secret = process.env.COOKIE_SECRET ?? "local-cookie-secret-for-tests-only";
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

export function getSessionExpiry() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);
  return expiresAt;
}

export function getSecureCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.APP_ENV === "production" || process.env.NODE_ENV === "production",
    path: "/",
  };
}
