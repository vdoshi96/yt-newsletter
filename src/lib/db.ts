import postgres from "postgres";

let client: postgres.Sql | null = null;

export function getSql() {
  if (client) return client;

  const connectionString = process.env.DATABASE_URL ?? process.env.DATABASE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("DATABASE_URL or DATABASE_CONNECTION_STRING is required for database access.");
  }

  client = postgres(connectionString, {
    max: Number(process.env.POSTGRES_MAX_CONNECTIONS ?? 3),
    prepare: false,
    ssl: connectionString.includes("localhost") ? false : "require",
  });

  return client;
}

export async function closeSql() {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
  }
}
