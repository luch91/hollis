import { fileURLToPath } from "node:url";
import { migrateDatabase } from "@hollis/database";
import { readDatabaseConnection } from "./config.js";

const migrationsFolder = fileURLToPath(
  new URL("../node_modules/@hollis/database/drizzle", import.meta.url),
);

await migrateDatabase(readDatabaseConnection(), migrationsFolder);
