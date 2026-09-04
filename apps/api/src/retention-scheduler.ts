import { createDatabase } from "@hollis/database";
import { readDatabaseConnection } from "./config.js";
import { fileURLToPath } from "node:url";
import { createGoogleCloudEvidenceStorage } from "./evidence-storage.js";
import { createPostgresRetentionDeletionJobStore } from "./persistence.js";
import { processRetentionForTenants } from "./retention-worker.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export async function runRetentionScheduler(): Promise<{ completed: number; failed: number }> {
  const tenantIds = required("RETENTION_TENANT_IDS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (tenantIds.length === 0) throw new Error("RETENTION_TENANT_IDS must contain a tenant ID.");

  const databaseResource = createDatabase(readDatabaseConnection());
  try {
    const storage = await createGoogleCloudEvidenceStorage(
      process.env.GCS_PROJECT_ID?.trim() || "hollis-507001",
      required("GCS_BUCKET"),
    );
    return processRetentionForTenants(
      tenantIds,
      createPostgresRetentionDeletionJobStore(databaseResource.database),
      storage,
    );
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
