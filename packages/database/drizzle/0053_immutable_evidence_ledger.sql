ALTER TYPE "review_status" ADD VALUE IF NOT EXISTS 'draft';--> statement-breakpoint
ALTER TYPE "review_event_type" ADD VALUE IF NOT EXISTS 'evidence_removed';--> statement-breakpoint
ALTER TYPE "review_event_type" ADD VALUE IF NOT EXISTS 'evidence_superseded';--> statement-breakpoint
ALTER TYPE "review_event_type" ADD VALUE IF NOT EXISTS 'evidence_verified';--> statement-breakpoint
ALTER TYPE "review_event_type" ADD VALUE IF NOT EXISTS 'evidence_upload_failed';--> statement-breakpoint
ALTER TYPE "review_event_type" ADD VALUE IF NOT EXISTS 'evidence_quarantine_cleaned';--> statement-breakpoint

ALTER TABLE "review_cases" ADD COLUMN IF NOT EXISTS "evidence_frozen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_cases" ADD COLUMN IF NOT EXISTS "evidence_legacy" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "evidence_objects" ALTER COLUMN "case_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence_objects" ADD COLUMN IF NOT EXISTS "provider_etag" text;--> statement-breakpoint
ALTER TABLE "evidence_objects" ADD COLUMN IF NOT EXISTS "provider_version" text;--> statement-breakpoint
ALTER TABLE "evidence_objects" ADD COLUMN IF NOT EXISTS "verified_at" timestamp with time zone;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "evidence_uploads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "case_id" uuid NOT NULL REFERENCES "review_cases"("id"),
  "evidence_object_id" uuid REFERENCES "evidence_objects"("id"),
  "digest" text NOT NULL,
  "media_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "quarantine_object_name" text NOT NULL,
  "state" text NOT NULL DEFAULT 'quarantined',
  "failure_code" text,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "evidence_uploads_quarantine_object_unique" ON "evidence_uploads" ("quarantine_object_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_uploads_tenant_case_created_idx" ON "evidence_uploads" ("tenant_id", "case_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_uploads_expiry_idx" ON "evidence_uploads" ("expires_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "evidence_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "case_id" uuid NOT NULL REFERENCES "review_cases"("id"),
  "evidence_object_id" uuid NOT NULL REFERENCES "evidence_objects"("id"),
  "ordinal" integer NOT NULL,
  "state" text NOT NULL DEFAULT 'active',
  "attached_by_user_id" text NOT NULL,
  "attached_at" timestamp with time zone NOT NULL DEFAULT now(),
  "removed_by_user_id" text,
  "removed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "evidence_attachments_case_object_unique" ON "evidence_attachments" ("case_id", "evidence_object_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "evidence_attachments_case_ordinal_unique" ON "evidence_attachments" ("case_id", "ordinal");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_attachments_tenant_case_idx" ON "evidence_attachments" ("tenant_id", "case_id", "ordinal");--> statement-breakpoint

INSERT INTO "evidence_attachments" ("tenant_id", "case_id", "evidence_object_id", "ordinal", "state", "attached_by_user_id", "attached_at", "created_at")
SELECT source."tenant_id", source."case_id", source."id", source."ordinal", 'legacy', 'system:migration', source."created_at", source."created_at"
FROM (
  SELECT eo.*, row_number() OVER (PARTITION BY eo."case_id" ORDER BY eo."created_at", eo."id")::integer AS "ordinal"
  FROM "evidence_objects" eo
  WHERE eo."case_id" IS NOT NULL
) AS source
ON CONFLICT ("case_id", "evidence_object_id") DO NOTHING;--> statement-breakpoint
UPDATE "review_cases" AS rc SET "evidence_legacy" = true
WHERE EXISTS (SELECT 1 FROM "evidence_attachments" ea WHERE ea."case_id" = rc."id" AND ea."state" = 'legacy');--> statement-breakpoint

ALTER TABLE "evidence_uploads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "evidence_uploads_tenant_isolation" ON "evidence_uploads" USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "evidence_attachments_tenant_isolation" ON "evidence_attachments" USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "evidence_uploads", "evidence_attachments" TO hollis_app;
