import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_MIGRATION_URL) {
  throw new Error("DATABASE_MIGRATION_URL is required for database commands.");
}

export default defineConfig({
  dbCredentials: {
    url: process.env.DATABASE_MIGRATION_URL,
  },
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/schema.ts",
  strict: true,
  verbose: true,
});
