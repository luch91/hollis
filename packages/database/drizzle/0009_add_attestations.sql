CREATE TYPE "public"."attestation_status" AS ENUM('submitted', 'accepted', 'appealed', 'finalized', 'failed', 'undetermined');--> statement-breakpoint
CREATE TABLE "attestations" (
  "case_commitment" text NOT NULL,
  "case_file" jsonb NOT NULL,
  "case_id" uuid NOT NULL,
  "contract_address" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" text NOT NULL,
  "provider_submission_id" text NOT NULL,
  "public_case_file_url" text NOT NULL,
  "status" "attestation_status" NOT NULL,
  "tenant_id" uuid NOT NULL,
  "transaction_hash" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "verdict" text
);
--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_case_id_review_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."review_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attestations_provider_submission_unique" ON "attestations" USING btree ("provider", "provider_submission_id");--> statement-breakpoint
CREATE INDEX "attestations_case_created_idx" ON "attestations" USING btree ("case_id", "created_at");--> statement-breakpoint
CREATE INDEX "attestations_tenant_case_idx" ON "attestations" USING btree ("tenant_id", "case_id");--> statement-breakpoint
ALTER TABLE "attestations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attestations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "attestations_tenant_isolation" ON "attestations"
  USING (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  );
--> statement-breakpoint
REVOKE DELETE ON TABLE "attestations" FROM hollis_app;
