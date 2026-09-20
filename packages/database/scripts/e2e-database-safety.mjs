const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
const approvedEnvironmentClasses = new Set(["evaluation", "staging", "test"]);

export function assertSafeE2eDatabase(rawUrl, label) {
  const parsed = new URL(rawUrl);
  const databaseName = parsed.pathname.slice(1);
  if (!/^[a-z0-9_]+_e2e$/.test(databaseName)) {
    throw new Error(`${label} database name must end with _e2e.`);
  }

  if (localHosts.has(parsed.hostname)) return parsed;

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

  return parsed;
}
