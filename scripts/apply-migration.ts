import "./load-env";
import { readdir, readFile } from "node:fs/promises";
import { closeSql, getSql } from "@/lib/db";

async function main() {
  const sql = getSql();
  const migrationFiles = (await readdir("supabase/migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const path = `supabase/migrations/${file}`;
    const migration = await readFile(path, "utf8");
    await sql.unsafe(migration);
    console.log(`Applied ${path}`);
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSql();
  });
