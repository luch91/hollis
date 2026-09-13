ALTER TABLE "review_cases" ADD CONSTRAINT "review_cases_id_tenant_unique" UNIQUE("id", "tenant_id");
--> statement-breakpoint
ALTER TABLE "policy_contract_deployments" ADD CONSTRAINT "policy_contract_deployments_id_tenant_unique" UNIQUE("id", "tenant_id");
--> statement-breakpoint

CREATE TABLE "managed_attestation_submissions" (
  "case_commitment" text NOT NULL,
  "case_id" uuid NOT NULL,
  "contract_address" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deployment_id" uuid NOT NULL,
  "evaluation_reason" text,
  "failure_code" text,
  "finalized_at" timestamp with time zone,
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "idempotency_key" text NOT NULL,
  "public_case_file_url" text NOT NULL,
  "runtime_address" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "tenant_id" uuid NOT NULL,
  "transaction_hash" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "verdict" text,
  CONSTRAINT "managed_attestation_submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id"),
  CONSTRAINT "managed_attestation_submissions_case_tenant_fk" FOREIGN KEY ("case_id", "tenant_id") REFERENCES "public"."review_cases"("id", "tenant_id"),
  CONSTRAINT "managed_attestation_submissions_deployment_tenant_fk" FOREIGN KEY ("deployment_id", "tenant_id") REFERENCES "public"."policy_contract_deployments"("id", "tenant_id"),
  CONSTRAINT "managed_attestation_submissions_transaction_unique" UNIQUE("transaction_hash"),
  CONSTRAINT "managed_attestation_submissions_status_check" CHECK ("status" IN ('pending', 'submitting', 'submitted', 'finalized', 'failed', 'reconciliation_required')),
  CONSTRAINT "managed_attestation_submissions_commitment_check" CHECK ("case_commitment" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "managed_attestation_submissions_idempotency_check" CHECK ("idempotency_key" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "managed_attestation_submissions_address_check" CHECK ("contract_address" ~ '^0x[a-fA-F0-9]{40}$' AND "runtime_address" ~ '^0x[a-fA-F0-9]{40}$'),
  CONSTRAINT "managed_attestation_submissions_transaction_check" CHECK ("transaction_hash" IS NULL OR "transaction_hash" ~ '^0x[a-fA-F0-9]{64}$'),
  CONSTRAINT "managed_attestation_submissions_url_check" CHECK ("public_case_file_url" ~ '^https://'),
  CONSTRAINT "managed_attestation_submissions_verdict_check" CHECK ("verdict" IS NULL OR "verdict" IN ('pass', 'fail', 'needs_review', 'undetermined'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX "managed_attestation_submissions_idempotency_unique" ON "managed_attestation_submissions" ("tenant_id", "idempotency_key");
CREATE INDEX "managed_attestation_submissions_case_idx" ON "managed_attestation_submissions" ("tenant_id", "case_id", "created_at");
CREATE INDEX "managed_attestation_submissions_status_idx" ON "managed_attestation_submissions" ("status", "updated_at");
--> statement-breakpoint

ALTER TABLE "managed_attestation_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "managed_attestation_submissions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "managed_attestation_submissions_tenant_isolation" ON "managed_attestation_submissions"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON TABLE "managed_attestation_submissions" TO hollis_app;
