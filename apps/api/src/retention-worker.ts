import type { EvidenceStorage } from "./evidence-storage.js";

export type RetentionDeletionJob = {
  evidenceId: string;
  jobId: string;
  objectName: string;
  tenantId: string;
};

export interface RetentionDeletionJobStore {
  claimNext(tenantId: string): Promise<RetentionDeletionJob | null>;
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
    await storage.delete(job.tenantId, job.objectName);
    await jobs.markCompleted(tenantId, job.jobId);
    return "completed";
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown storage deletion failure.";
    await jobs.markFailed(tenantId, job.jobId, reason);
    return "failed";
  }
}
