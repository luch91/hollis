CREATE TABLE "public_attestation_case_files" (
  "case_commitment" text NOT NULL,
  "case_file" jsonb NOT NULL,
  "case_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "public_id" uuid PRIMARY KEY NOT NULL,
  "revoked_at" timestamp with time zone,
  "tenant_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "public_attestation_case_files" ADD CONSTRAINT "public_attestation_case_files_case_id_review_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."review_cases"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "public_attestation_case_files" ADD CONSTRAINT "public_attestation_case_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "public_attestation_case_files_case_idx" ON "public_attestation_case_files" USING btree ("case_id", "created_at");
--> statement-breakpoint
CREATE INDEX "public_attestation_case_files_tenant_case_idx" ON "public_attestation_case_files" USING btree ("tenant_id", "case_id");
--> statement-breakpoint
ALTER TABLE "public_attestation_case_files" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public_attestation_case_files" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "public_attestation_case_files_tenant_isolation" ON "public_attestation_case_files"
  USING (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  );
--> statement-breakpoint
CREATE POLICY "public_attestation_case_files_public_read" ON "public_attestation_case_files"
  FOR SELECT
  USING (
    "public_id" = nullif(current_setting('app.public_attestation_case_file_id', true), '')::uuid
    AND "revoked_at" IS NULL
  );
--> statement-breakpoint
REVOKE DELETE ON TABLE "public_attestation_case_files" FROM hollis_app;
