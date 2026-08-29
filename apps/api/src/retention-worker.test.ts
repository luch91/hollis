import { describe, expect, it, vi } from "vitest";
import type { EvidenceStorage } from "./evidence-storage.js";
import {
  processNextRetentionDeletion,
  type RetentionDeletionJobStore,
} from "./retention-worker.js";

const job = {
  evidenceId: "evidence-1",
  jobId: "job-1",
  objectName: "tenants/tenant-1/evidence/a",
  tenantId: "tenant-1",
};

function createJobs(overrides: Partial<RetentionDeletionJobStore> = {}) {
  return {
    claimNext: vi.fn(async () => job),
    markCompleted: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
    ...overrides,
  } satisfies RetentionDeletionJobStore;
}

describe("retention deletion worker", () => {
  it("deletes through the tenant-scoped adapter and marks the job complete", async () => {
    const jobs = createJobs();
    const remove = vi.fn(async () => {});
    const storage = { delete: remove } as unknown as EvidenceStorage;

    await expect(processNextRetentionDeletion(jobs, storage)).resolves.toBe("completed");
    expect(remove).toHaveBeenCalledWith(job.tenantId, job.objectName);
    expect(jobs.markCompleted).toHaveBeenCalledWith(job.jobId);
    expect(jobs.markFailed).not.toHaveBeenCalled();
  });

  it("records a failure without losing the job when storage deletion fails", async () => {
    const jobs = createJobs();
    const storage = {
      delete: vi.fn(async () => {
        throw new Error("storage unavailable");
      }),
    } as unknown as EvidenceStorage;

    await expect(processNextRetentionDeletion(jobs, storage)).resolves.toBe("failed");
    expect(jobs.markFailed).toHaveBeenCalledWith(job.jobId, "storage unavailable");
    expect(jobs.markCompleted).not.toHaveBeenCalled();
  });

  it("does nothing when no authorized deletion job is available", async () => {
    const jobs = createJobs({ claimNext: vi.fn(async () => null) });
    const storage = { delete: vi.fn(async () => {}) } as unknown as EvidenceStorage;

    await expect(processNextRetentionDeletion(jobs, storage)).resolves.toBe("empty");
    expect(storage.delete).not.toHaveBeenCalled();
  });
});
