import type { EvidenceStorage } from "./evidence-storage.js";

export type RetentionDeletionJob = {
  evidenceId: string;
  jobId: string;
  objectName: string;
  tenantId: string;
};

export interface RetentionDeletionJobStore {
  claimNext(): Promise<RetentionDeletionJob | null>;
  markCompleted(jobId: string): Promise<void>;
  markFailed(jobId: string, reason: string): Promise<void>;
}

export async function processNextRetentionDeletion(
  jobs: RetentionDeletionJobStore,
  storage: EvidenceStorage,
): Promise<"completed" | "failed" | "empty"> {
  const job = await jobs.claimNext();
  if (!job) return "empty";

  try {
    await storage.delete(job.tenantId, job.objectName);
    await jobs.markCompleted(job.jobId);
    return "completed";
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown storage deletion failure.";
    await jobs.markFailed(job.jobId, reason);
    return "failed";
  }
}
