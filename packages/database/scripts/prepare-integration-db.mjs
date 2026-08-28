import postgres from "postgres";

const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_TEST_URL is required for integration database preparation.");
}

const client = postgres(databaseUrl, { max: 1 });

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
  await client.unsafe("GRANT USAGE ON SCHEMA public TO hollis_app");
  await client.unsafe(`
    ALTER ROLE hollis_app WITH
      LOGIN
      PASSWORD 'hollis_app'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS
  `);
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
