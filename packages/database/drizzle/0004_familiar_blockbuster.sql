CREATE TABLE "evidence_objects" (
	"case_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"digest" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_hold" text DEFAULT 'none' NOT NULL,
	"media_type" text NOT NULL,
	"object_name" text NOT NULL,
	"retention_until" timestamp with time zone,
	"size_bytes" integer NOT NULL,
	"tenant_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence_objects" ADD CONSTRAINT "evidence_objects_case_id_review_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."review_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_objects" ADD CONSTRAINT "evidence_objects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_objects_tenant_digest_unique" ON "evidence_objects" USING btree ("tenant_id","digest");--> statement-breakpoint
CREATE INDEX "evidence_objects_case_idx" ON "evidence_objects" USING btree ("case_id");
--> statement-breakpoint
ALTER TABLE "evidence_objects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence_objects" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "evidence_objects_tenant_isolation" ON "evidence_objects"
  USING (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  );--> statement-breakpoint
REVOKE UPDATE, DELETE ON TABLE "evidence_objects" FROM hollis_app;
