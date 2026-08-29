CREATE TYPE "public"."retention_deletion_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
ALTER TYPE "public"."review_event_type" ADD VALUE 'retention_deletion_requested';--> statement-breakpoint
ALTER TYPE "public"."review_event_type" ADD VALUE 'evidence_deleted';--> statement-breakpoint
CREATE TABLE "retention_deletion_jobs" (
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"case_id" uuid NOT NULL,
	"claimed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"last_error" text,
	"object_name" text NOT NULL,
	"status" "retention_deletion_status" DEFAULT 'pending' NOT NULL,
	"tenant_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retention_deletion_jobs" ADD CONSTRAINT "retention_deletion_jobs_case_id_review_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."review_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_deletion_jobs" ADD CONSTRAINT "retention_deletion_jobs_evidence_id_evidence_objects_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_deletion_jobs" ADD CONSTRAINT "retention_deletion_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "retention_deletion_jobs_evidence_unique" ON "retention_deletion_jobs" USING btree ("tenant_id","evidence_id");--> statement-breakpoint
CREATE INDEX "retention_deletion_jobs_claim_idx" ON "retention_deletion_jobs" USING btree ("status","available_at");
--> statement-breakpoint
ALTER TABLE "retention_deletion_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "retention_deletion_jobs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "retention_deletion_jobs_tenant_isolation" ON "retention_deletion_jobs"
  USING (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  );
