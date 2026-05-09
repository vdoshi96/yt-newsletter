import "./load-env";
import { closeSql, getSql } from "@/lib/db";
import { linkUserCreator, seedStarterCreator } from "@/lib/creators";

async function main() {
  const creatorId = await seedStarterCreator();
  const username = process.env.FIRST_ADMIN_USERNAME;
  if (username) {
    const sql = getSql();
    const users = await sql<{ id: string }[]>`
      select id from app_users where lower(username) = lower(${username}) limit 1
    `;
    if (users[0]) {
      await linkUserCreator(users[0].id, creatorId);
    }
  }
  console.log("Seeded starter creator: https://www.youtube.com/@NateBJones");
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSql();
  });
