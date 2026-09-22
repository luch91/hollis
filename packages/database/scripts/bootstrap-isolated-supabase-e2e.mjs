import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeE2eDatabase } from "./e2e-database-safety.mjs";

const projectRef = process.env.HOLLIS_E2E_ISOLATED_SUPABASE_PROJECT_REF?.trim().toLowerCase();
const poolerInput = process.env.HOLLIS_E2E_ALLOWED_DATABASE_HOST?.trim();
const token = process.env.HOLLIS_E2E_MANAGEMENT_TOKEN?.trim();
const environment = process.env.HOLLIS_E2E_APPROVED_ENVIRONMENT?.trim().toLowerCase();
const approvedEnvironments = new Set(["evaluation", "staging", "test"]);

function parsePoolerHost(value) {
  if (!value) return undefined;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

const poolerHost = parsePoolerHost(poolerInput);

if (!/^[a-z0-9]{20}$/.test(projectRef ?? "")) {
  throw new Error(
    "HOLLIS_E2E_ISOLATED_SUPABASE_PROJECT_REF must be the exact isolated project ref.",
  );
}
if (!poolerHost?.endsWith(".pooler.supabase.com")) {
  throw new Error(
    "HOLLIS_E2E_ALLOWED_DATABASE_HOST must be a copied Supabase Session Pooler host or connection string.",
  );
}
if (!approvedEnvironments.has(environment)) {
  throw new Error("HOLLIS_E2E_APPROVED_ENVIRONMENT must be evaluation, staging, or test.");
}
if (!token) throw new Error("HOLLIS_E2E_MANAGEMENT_TOKEN is required.");

// The operator may paste the full Session Pooler URL, but downstream safety
// checks deliberately compare hostnames only.
process.env.HOLLIS_E2E_ALLOWED_DATABASE_HOST = poolerHost;

const here = fileURLToPath(new URL(".", import.meta.url));
const migrationsDirectory = join(here, "..", "drizzle");
const journal = JSON.parse(
  await readFile(join(migrationsDirectory, "meta", "_journal.json"), "utf8"),
);

async function query(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase SQL request failed (${response.status}): ${detail}`);
  }
  return response.json();
}

await query(`
  create schema if not exists drizzle;
  create table if not exists drizzle.__drizzle_migrations (
    id serial primary key,
    hash text not null,
    created_at bigint not null
  );
  do $$
  begin
    if not exists (select 1 from pg_roles where rolname = 'hollis_app') then
      create role hollis_app nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'hollis_migrator') then
      create role hollis_migrator nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
    end if;
  end
  $$;
`);

const migrationNames = (await readdir(migrationsDirectory))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const migrationByTag = new Map(journal.entries.map((entry) => [entry.tag, entry]));

for (const name of migrationNames) {
  const tag = name.slice(0, -4);
  const entry = migrationByTag.get(tag);
  if (!entry) throw new Error(`Missing Drizzle journal entry for ${name}.`);
  const migration = await readFile(join(migrationsDirectory, name), "utf8");
  const hash = createHash("sha256").update(migration).digest("hex");
  const existing = await query(
    `select 1 from drizzle.__drizzle_migrations where hash = '${hash}' limit 1;`,
  );
  if (Array.isArray(existing) && existing.length > 0) continue;
  await query(`
    begin;
    ${migration}
    insert into drizzle.__drizzle_migrations (hash, created_at)
    values ('${hash}', ${entry.when});
    commit;
  `);
}

const runtimePassword = randomBytes(36).toString("base64url");
const sqlPassword = runtimePassword.replaceAll("'", "''");
await query(`
  alter role hollis_app with login password '${sqlPassword}';
  grant usage on schema public to hollis_app;
  alter default privileges in schema public grant select, insert, update, delete on tables to hollis_app;
  alter default privileges in schema public grant usage, select on sequences to hollis_app;
`);

const runtimeUrl = `postgresql://hollis_app.${projectRef}:${runtimePassword}@${poolerHost}:5432/postgres?sslmode=require`;
assertSafeE2eDatabase(runtimeUrl, "Hollis E2E runtime database");
execFileSync(
  "vercel",
  ["env", "add", "DATABASE_URL", "preview", "--force", "--project", "hollis-api"],
  {
    input: runtimeUrl,
    stdio: ["pipe", "inherit", "inherit"],
  },
);

console.log("Isolated Supabase E2E schema initialized and Preview runtime connection updated.");
