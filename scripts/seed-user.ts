import "./load-env";
import { closeSql } from "@/lib/db";
import { createUser } from "@/lib/auth/login";

async function main() {
  const username = process.env.FIRST_ADMIN_USERNAME;
  const password = process.env.FIRST_ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error("FIRST_ADMIN_USERNAME and FIRST_ADMIN_PASSWORD are required.");
  }

  await createUser({ username, password, role: "admin" });
  console.log(`Seeded first admin user: ${username}`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSql();
  });
