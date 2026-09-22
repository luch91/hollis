const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
const approvedEnvironmentClasses = new Set(["evaluation", "staging", "test"]);

function approvedRemoteContext(parsed, label) {
  const allowedHost = process.env.HOLLIS_E2E_ALLOWED_DATABASE_HOST?.trim().toLowerCase();
  const environmentClass = process.env.HOLLIS_E2E_APPROVED_ENVIRONMENT?.trim().toLowerCase();
  if (
    !allowedHost ||
    parsed.hostname.toLowerCase() !== allowedHost ||
    !environmentClass ||
    !approvedEnvironmentClasses.has(environmentClass)
  ) {
    throw new Error(
      `${label} requires an exact remote host allowlist and an evaluation, staging, or test environment.`,
    );
  }
  return allowedHost;
}

function isExplicitIsolatedSupabaseProject(parsed, allowedHost) {
  const projectRef = process.env.HOLLIS_E2E_ISOLATED_SUPABASE_PROJECT_REF?.trim().toLowerCase();
  if (!/^[a-z0-9]{20}$/.test(projectRef ?? "") || parsed.pathname !== "/postgres") return false;

  const directHost = `db.${projectRef}.supabase.co`;
  if (allowedHost === directHost && parsed.hostname.toLowerCase() === directHost) {
    return parsed.username === "postgres";
  }

  const sharedPooler = allowedHost.endsWith(".pooler.supabase.com");
  return sharedPooler && parsed.username.endsWith(`.${projectRef}`);
}

export function assertSafeE2eDatabase(rawUrl, label) {
  const parsed = new URL(rawUrl);
  const databaseName = parsed.pathname.slice(1);
  const hasE2eName = /^[a-z0-9_]+_e2e$/.test(databaseName);
  if (localHosts.has(parsed.hostname)) {
    if (!hasE2eName) throw new Error(`${label} database name must end with _e2e.`);
    return parsed;
  }

  const allowedHost = approvedRemoteContext(parsed, label);
  if (hasE2eName || isExplicitIsolatedSupabaseProject(parsed, allowedHost)) return parsed;

  throw new Error(
    `${label} database name must end with _e2e unless it is the explicit isolated Supabase project.`,
  );
}
