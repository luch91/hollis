ALTER TABLE "policy_controls" ADD CONSTRAINT "policy_controls_id_tenant_unique" UNIQUE("id", "tenant_id");
--> statement-breakpoint

CREATE TABLE "policy_contract_deployments" (
  "activated_at" timestamp with time zone,
  "binding" jsonb NOT NULL,
  "binding_digest" text NOT NULL,
  "contract_address" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "deployment_transaction_hash" text,
  "failure_code" text,
  "finalized_at" timestamp with time zone,
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "network" text NOT NULL,
  "network_chain_id" integer NOT NULL,
  "policy_control_record_id" uuid NOT NULL,
  "runtime_address" text NOT NULL,
  "source_digest" text NOT NULL,
  "source_version" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "tenant_id" uuid NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "verified_at" timestamp with time zone,
  CONSTRAINT "policy_contract_deployments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id"),
  CONSTRAINT "policy_contract_deployments_policy_control_record_id_policy_controls_id_fk" FOREIGN KEY ("policy_control_record_id") REFERENCES "public"."policy_controls"("id"),
  CONSTRAINT "policy_contract_deployments_control_tenant_fk" FOREIGN KEY ("policy_control_record_id", "tenant_id") REFERENCES "public"."policy_controls"("id", "tenant_id"),
  CONSTRAINT "policy_contract_deployments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id"),
  CONSTRAINT "policy_contract_deployments_transaction_unique" UNIQUE("deployment_transaction_hash"),
  CONSTRAINT "policy_contract_deployments_network_check" CHECK ("network" = 'studio-dev'),
  CONSTRAINT "policy_contract_deployments_chain_check" CHECK ("network_chain_id" = 61997),
  CONSTRAINT "policy_contract_deployments_status_check" CHECK ("status" IN ('pending', 'submitting', 'submitted', 'finalized', 'verified', 'active', 'failed', 'binding_mismatch', 'superseded')),
  CONSTRAINT "policy_contract_deployments_binding_digest_check" CHECK ("binding_digest" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "policy_contract_deployments_source_digest_check" CHECK ("source_digest" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "policy_contract_deployments_address_check" CHECK ("runtime_address" ~ '^0x[a-fA-F0-9]{40}$'),
  CONSTRAINT "policy_contract_deployments_contract_address_check" CHECK ("contract_address" IS NULL OR "contract_address" ~ '^0x[a-fA-F0-9]{40}$'),
  CONSTRAINT "policy_contract_deployments_transaction_check" CHECK ("deployment_transaction_hash" IS NULL OR "deployment_transaction_hash" ~ '^0x[a-fA-F0-9]{64}$')
);
--> statement-breakpoint

CREATE UNIQUE INDEX "policy_contract_deployments_binding_unique" ON "policy_contract_deployments" ("tenant_id", "binding_digest", "network_chain_id", "source_digest");
CREATE INDEX "policy_contract_deployments_control_idx" ON "policy_contract_deployments" ("tenant_id", "policy_control_record_id", "created_at");
CREATE INDEX "policy_contract_deployments_status_idx" ON "policy_contract_deployments" ("status", "updated_at");
CREATE UNIQUE INDEX "policy_contract_deployments_active_control_unique" ON "policy_contract_deployments" ("tenant_id", "policy_control_record_id") WHERE "status" = 'active';
--> statement-breakpoint

ALTER TABLE "policy_contract_deployments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_contract_deployments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "policy_contract_deployments_tenant_isolation" ON "policy_contract_deployments"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON TABLE "policy_contract_deployments" TO hollis_app;
