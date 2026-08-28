ALTER TABLE "review_cases" ADD COLUMN "intake_fingerprint" text;--> statement-breakpoint
UPDATE "review_cases"
SET "intake_fingerprint" = 'legacy:' || "id"::text
WHERE "intake_fingerprint" IS NULL;--> statement-breakpoint
ALTER TABLE "review_cases" ALTER COLUMN "intake_fingerprint" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenants_organization_isolation" ON "tenants"
  USING (
    "workos_organization_id" = nullif(current_setting('app.workos_organization_id', true), '')
  )
  WITH CHECK (
    "workos_organization_id" = nullif(current_setting('app.workos_organization_id', true), '')
  );--> statement-breakpoint
ALTER TABLE "tenant_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_memberships_isolation" ON "tenant_memberships"
  USING (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  );--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "users_tenant_isolation" ON "users"
  USING (
    EXISTS (
      SELECT 1
      FROM "tenant_memberships"
      WHERE "tenant_memberships"."user_id" = "users"."id"
        AND "tenant_memberships"."tenant_id" =
          nullif(current_setting('app.tenant_id', true), '')::uuid
    )
  );--> statement-breakpoint
ALTER TABLE "review_cases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "review_cases" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "review_cases_tenant_isolation" ON "review_cases"
  USING (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  );--> statement-breakpoint
ALTER TABLE "review_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "review_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "review_events_tenant_isolation" ON "review_events"
  USING (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  );--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE "tenants" FROM hollis_app;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE "users" FROM hollis_app;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE "tenant_memberships" FROM hollis_app;--> statement-breakpoint
REVOKE DELETE ON TABLE "review_cases" FROM hollis_app;--> statement-breakpoint
REVOKE UPDATE, DELETE ON TABLE "review_events" FROM hollis_app;
