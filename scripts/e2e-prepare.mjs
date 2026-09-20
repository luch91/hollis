import { spawnSync } from "node:child_process";

const adminUrl =
  process.env.E2E_DATABASE_ADMIN_URL ?? "postgres://hollis:hollis@127.0.0.1:5434/hollis_e2e";
const runtimeUrl =
  process.env.E2E_DATABASE_RUNTIME_URL ??
  "postgres://hollis_app:hollis_app@127.0.0.1:5434/hollis_e2e";
const usesDefaultLocalDatabase =
  !process.env.E2E_DATABASE_ADMIN_URL && !process.env.E2E_DATABASE_RUNTIME_URL;

function assertSafeDatabase(raw, label) {
  const url = new URL(raw);
  const database = url.pathname.slice(1);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error(`${label} must use a local database host.`);
  }
  if (!database.endsWith("_e2e") || database.length <= "_e2e".length) {
    throw new Error(`${label} database name must end with _e2e.`);
  }
  return database;
}

const adminDatabase = assertSafeDatabase(adminUrl, "E2E_DATABASE_ADMIN_URL");
const runtimeDatabase = assertSafeDatabase(runtimeUrl, "E2E_DATABASE_RUNTIME_URL");
if (adminDatabase !== runtimeDatabase) {
  throw new Error("E2E administrator and runtime URLs must target the same database.");
}

function run(command, args, environment = {}) {
  const result = spawnSync(command, args, {
    env: { ...process.env, ...environment },
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (usesDefaultLocalDatabase && !process.env.CI) {
  run("docker", ["compose", "up", "-d", "postgres"]);
}

run("pnpm", ["--filter", "@hollis/database", "db:prepare-e2e", "reset"], {
  E2E_DATABASE_ADMIN_URL: adminUrl,
});
run("pnpm", ["--filter", "@hollis/database", "db:prepare-test"], {
  DATABASE_TEST_URL: adminUrl,
});
run("pnpm", ["--filter", "@hollis/database", "db:migrate"], {
  DATABASE_MIGRATION_URL: adminUrl,
});
run("pnpm", ["--filter", "@hollis/database", "db:prepare-e2e", "seed"], {
  E2E_DATABASE_ADMIN_URL: adminUrl,
});
run("pnpm", ["--filter", "@hollis/api", "build"]);
run("pnpm", ["--filter", "@hollis/web", "build"], {
  NEXT_PUBLIC_API_URL: "http://127.0.0.1:4321",
});
