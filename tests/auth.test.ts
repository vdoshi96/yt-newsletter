import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import { createSessionToken, hashSessionToken } from "../src/lib/auth/session";

describe("password hashing", () => {
  it("uses Argon2id and verifies the original password only", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).toContain("$argon2id$");
    expect(hash).not.toContain("correct horse");
    await expect(verifyPassword(hash, "correct horse battery staple")).resolves.toBe(true);
    await expect(verifyPassword(hash, "wrong password")).resolves.toBe(false);
  });
});

describe("session tokens", () => {
  it("creates opaque tokens and stores only stable hashes", () => {
    const token = createSessionToken();
    const again = createSessionToken();

    expect(token).not.toEqual(again);
    expect(token.length).toBeGreaterThanOrEqual(48);
    expect(hashSessionToken(token)).toEqual(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toEqual(token);
  });
});
