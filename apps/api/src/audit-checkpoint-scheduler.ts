import { fileURLToPath } from "node:url";
import { createDatabase } from "@hollis/database";
import { sql } from "drizzle-orm";
import { createAuditCheckpointSigner } from "./audit-checkpoint.js";
import { readDatabaseConnection, readEnvironment } from "./config.js";
import { createPostgresReviewWorkflowStore } from "./persistence.js";

/**
 * Create one immutable signed checkpoint for every changed case head. Run this
 * command from the approved periodic scheduler; duplicate heads are absorbed
 * by the database uniqueness constraint.
 */
export async function runAuditCheckpointScheduler(): Promise<{ checked: number }> {
  const environment = readEnvironment();
  if (
    !environment.AUDIT_CHECKPOINT_KEY_ID ||
    !environment.AUDIT_CHECKPOINT_PRIVATE_KEY_BASE64 ||
    !environment.AUDIT_CHECKPOINT_PUBLIC_KEY_BASE64
  ) {
    throw new Error("Audit checkpoint signing is not configured.");
  }
  const resource = createDatabase(readDatabaseConnection());
  try {
    const signer = createAuditCheckpointSigner({
      keyId: environment.AUDIT_CHECKPOINT_KEY_ID,
      privateKeyBase64: environment.AUDIT_CHECKPOINT_PRIVATE_KEY_BASE64,
      publicKeyBase64: environment.AUDIT_CHECKPOINT_PUBLIC_KEY_BASE64,
    });
    const store = createPostgresReviewWorkflowStore(resource.database, signer);
    const records = await resource.database.execute<{ caseId: string; tenantId: string }>(
      sql`select * from public.list_hollis_audit_checkpoint_candidates()`,
    );
    for (const record of records) {
      await store.exportCase(record.tenantId, record.caseId);
    }
    return { checked: records.length };
  } finally {
    await resource.client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAuditCheckpointScheduler()
    .then((result) =>
      process.stdout.write(`Audit checkpoint pass checked ${result.checked} case chains.\n`),
    )
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Audit checkpoint pass failed."}\n`,
      );
      process.exitCode = 1;
    });
}
