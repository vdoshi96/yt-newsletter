import "./load-env";
import { readFile } from "node:fs/promises";
import { closeSql, getSql } from "@/lib/db";

async function main() {
  const sql = getSql();
  const migration = await readFile("supabase/migrations/001_initial_schema.sql", "utf8");
  await sql.unsafe(migration);
  console.log("Applied supabase/migrations/001_initial_schema.sql");
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSql();
  });
