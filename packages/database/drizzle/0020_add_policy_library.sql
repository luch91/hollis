CREATE TYPE "policy_publication_status" AS ENUM ('published');
--> statement-breakpoint

CREATE TABLE "policy_versions" (
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "document_digest" text NOT NULL,
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "policy_id" text NOT NULL,
  "published_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" "policy_publication_status" DEFAULT 'published' NOT NULL,
  "tenant_id" uuid NOT NULL,
  "title" text NOT NULL,
  "version" text NOT NULL,
  CONSTRAINT "policy_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "policy_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint

CREATE TABLE "policy_controls" (
  "attestation_criterion" text NOT NULL,
  "control_id" text NOT NULL,
  "control_version" text NOT NULL,
  "evidence_requirement" text NOT NULL,
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "interpretation" text NOT NULL,
  "policy_version_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "title" text NOT NULL,
  CONSTRAINT "policy_controls_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "policy_controls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint

CREATE UNIQUE INDEX "policy_versions_tenant_policy_version_unique" ON "policy_versions" USING btree ("tenant_id","policy_id","version");
CREATE INDEX "policy_versions_tenant_published_idx" ON "policy_versions" USING btree ("tenant_id","published_at");
CREATE UNIQUE INDEX "policy_controls_version_control_unique" ON "policy_controls" USING btree ("policy_version_id","control_id");
CREATE INDEX "policy_controls_tenant_version_idx" ON "policy_controls" USING btree ("tenant_id","policy_version_id");
--> statement-breakpoint

ALTER TABLE "policy_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_versions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "policy_controls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_controls" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "policy_versions_tenant_isolation" ON "policy_versions"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "policy_controls_tenant_isolation" ON "policy_controls"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

GRANT SELECT, INSERT ON TABLE "policy_versions" TO hollis_app;
GRANT SELECT, INSERT ON TABLE "policy_controls" TO hollis_app;
