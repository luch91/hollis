import postgres from "postgres";
import { assertSafeE2eDatabase } from "./e2e-database-safety.mjs";

const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_TEST_URL is required for integration database preparation.");
}
assertSafeE2eDatabase(databaseUrl, "DATABASE_TEST_URL");

const client = postgres(databaseUrl, { max: 1 });
const runtimePassword = process.env.E2E_RUNTIME_DATABASE_PASSWORD ?? "hollis_app";
if (runtimePassword.includes("\0")) {
  throw new Error("E2E_RUNTIME_DATABASE_PASSWORD cannot contain a null byte.");
}
const escapedRuntimePassword = runtimePassword.replaceAll("'", "''");

try {
  await client.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hollis_app') THEN
        CREATE ROLE hollis_app
          NOLOGIN
          NOSUPERUSER
          NOCREATEDB
          NOCREATEROLE
          NOINHERIT
          NOREPLICATION
          NOBYPASSRLS;
      END IF;
    END
    $$
  `);
  await client.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hollis_migrator') THEN
        CREATE ROLE hollis_migrator
          NOLOGIN
          NOSUPERUSER
          NOCREATEDB
          NOCREATEROLE
          NOINHERIT
          NOREPLICATION
          NOBYPASSRLS;
      END IF;
    END
    $$
  `);
  await client.unsafe("GRANT USAGE ON SCHEMA public TO hollis_app");
  const [runtimeRole] = await client`
    select rolbypassrls, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolsuper
    from pg_roles
    where rolname = 'hollis_app'
  `;
  if (
    !runtimeRole ||
    runtimeRole.rolbypassrls ||
    runtimeRole.rolcreatedb ||
    runtimeRole.rolcreaterole ||
    runtimeRole.rolinherit ||
    runtimeRole.rolreplication ||
    runtimeRole.rolsuper
  ) {
    throw new Error("The hollis_app role has unsafe database privileges.");
  }
  await client.unsafe(`ALTER ROLE hollis_app WITH LOGIN PASSWORD '${escapedRuntimePassword}'`);
  await client.unsafe(`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hollis_app
  `);
  await client.unsafe(`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO hollis_app
  `);
} finally {
  await client.end();
}
