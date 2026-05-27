import "./load-env";
import { closeSql } from "@/lib/db";
import { processIngestQueue } from "@/lib/processor";

async function main() {
  const result = await processIngestQueue();
  console.log(
    `Processed ${result.processed} queued item(s). Limit: ${result.limit}. Concurrency: ${result.concurrency}.`,
  );
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSql();
  });
