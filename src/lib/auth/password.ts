import { hash, verify } from "@node-rs/argon2";

export async function hashPassword(password: string) {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  return hash(password, {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
