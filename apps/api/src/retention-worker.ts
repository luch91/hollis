import type { EvidenceStorage } from "./evidence-storage.js";

export type RetentionDeletionJob = {
  evidenceId: string;
  jobId: string;
  objectName: string;
  tenantId: string;
};

export interface RetentionDeletionJobStore {
  canDelete(tenantId: string, jobId: string): Promise<boolean>;
  claimNext(tenantId: string): Promise<RetentionDeletionJob | null>;
  listEligibleTenantIds(): Promise<string[]>;
  scheduleEligible(tenantId: string, limit: number): Promise<number>;
  markCompleted(tenantId: string, jobId: string): Promise<void>;
  markFailed(tenantId: string, jobId: string, reason: string): Promise<void>;
}

export async function processNextRetentionDeletion(
  tenantId: string,
  jobs: RetentionDeletionJobStore,
  storage: EvidenceStorage,
): Promise<"completed" | "failed" | "empty"> {
  const job = await jobs.claimNext(tenantId);
  if (!job) return "empty";

  try {
    if (!(await jobs.canDelete(tenantId, job.jobId))) return "empty";
    await storage.delete(job.tenantId, job.objectName);
    await jobs.markCompleted(tenantId, job.jobId);
    return "completed";
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown storage deletion failure.";
    await jobs.markFailed(tenantId, job.jobId, reason);
    return "failed";
  }
}

export async function processRetentionForTenants(
  tenantIds: readonly string[],
  jobs: RetentionDeletionJobStore,
  storage: EvidenceStorage,
): Promise<{ completed: number; failed: number }> {
  const result = { completed: 0, failed: 0 };
  for (const tenantId of tenantIds) {
    const outcome = await processNextRetentionDeletion(tenantId, jobs, storage);
    if (outcome === "completed") result.completed += 1;
    if (outcome === "failed") result.failed += 1;
  }
  return result;
}
