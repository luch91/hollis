import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { DatabaseConnectionOptions } from "./client.js";

export async function migrateDatabase(
  connection: string | DatabaseConnectionOptions,
  migrationsFolder: string,
): Promise<void> {
  const client = typeof connection === "string" ? postgres(connection) : postgres(connection);
  const database = drizzle(client);

  try {
    await migrate(database, { migrationsFolder });
  } finally {
    await client.end({ timeout: 5 });
  }
}
