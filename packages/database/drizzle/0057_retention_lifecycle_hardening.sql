ALTER TYPE "retention_deletion_status" ADD VALUE IF NOT EXISTS 'dead_letter';

ALTER TABLE "evidence_objects"
  ADD COLUMN "deleted_at" timestamp with time zone,
  ADD COLUMN "deletion_provider_result" text;

ALTER TABLE "retention_deletion_jobs"
  ADD COLUMN "lease_expires_at" timestamp with time zone;

CREATE INDEX "retention_deletion_jobs_lease_idx"
  ON "retention_deletion_jobs" ("status", "lease_expires_at");
