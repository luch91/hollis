CREATE TABLE "audit_checkpoints" (
  "algorithm" text NOT NULL,
  "case_id" uuid NOT NULL REFERENCES "review_cases"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "event_count" integer NOT NULL,
  "head_hash" text NOT NULL,
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key_id" text NOT NULL,
  "signature" text NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  CONSTRAINT "audit_checkpoints_event_count_positive" CHECK ("event_count" > 0)
);
CREATE UNIQUE INDEX "audit_checkpoints_case_head_unique"
  ON "audit_checkpoints" ("tenant_id", "case_id", "head_hash");
CREATE INDEX "audit_checkpoints_tenant_case_created_idx"
  ON "audit_checkpoints" ("tenant_id", "case_id", "created_at");
ALTER TABLE "audit_checkpoints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_checkpoints" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_checkpoints_tenant_isolation" ON "audit_checkpoints"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON TABLE "audit_checkpoints" TO hollis_app;
REVOKE UPDATE, DELETE ON TABLE "audit_checkpoints" FROM hollis_app;
