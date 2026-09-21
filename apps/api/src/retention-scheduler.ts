import { fileURLToPath } from "node:url";
import { createDatabase } from "@hollis/database";
import { readDatabaseConnection, readEnvironment } from "./config.js";
import { createConfiguredEvidenceStorage } from "./configured-evidence-storage.js";
import { createPostgresRetentionDeletionJobStore } from "./persistence.js";
import { processRetentionForTenants } from "./retention-worker.js";

export async function runRetentionScheduler(): Promise<{ completed: number; failed: number }> {
  const environment = readEnvironment();
  const storage = await createConfiguredEvidenceStorage(environment);
  if (!storage) throw new Error("Evidence storage is not configured.");

  const databaseResource = createDatabase(readDatabaseConnection());
  try {
    const jobs = createPostgresRetentionDeletionJobStore(databaseResource.database);
    const tenantIds = await jobs.listEligibleTenantIds();
    await Promise.all(tenantIds.map((tenantId) => jobs.scheduleEligible(tenantId, 25)));
    return processRetentionForTenants(tenantIds, jobs, storage);
  } finally {
    await databaseResource.client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runRetentionScheduler()
    .then((result) => {
      process.stdout.write(
        `Retention pass completed: ${result.completed} completed, ${result.failed} failed.\n`,
      );
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Retention pass failed."}\n`,
      );
      process.exitCode = 1;
    });
}
