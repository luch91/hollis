CREATE TYPE "public"."review_event_type" AS ENUM('case_created', 'review_started', 'evidence_added', 'decision_recorded', 'case_escalated', 'attestation_recorded');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'in_review', 'completed', 'escalated');--> statement-breakpoint
CREATE TABLE "review_cases" (
	"automated_system_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_reference" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_version" text NOT NULL,
	"recommendation" text NOT NULL,
	"risk_level" text NOT NULL,
	"rule_id" text NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"tenant_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_events" (
	"actor_id" text NOT NULL,
	"case_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_hash" text NOT NULL,
	"event_type" "review_event_type" NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payload" jsonb NOT NULL,
	"previous_hash" text,
	"tenant_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_memberships" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"workos_membership_id" text NOT NULL,
	CONSTRAINT "tenant_memberships_workos_membership_id_unique" UNIQUE("workos_membership_id")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"workos_organization_id" text NOT NULL,
	CONSTRAINT "tenants_workos_organization_id_unique" UNIQUE("workos_organization_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workos_user_id" text NOT NULL,
	CONSTRAINT "users_workos_user_id_unique" UNIQUE("workos_user_id")
);
--> statement-breakpoint
ALTER TABLE "review_cases" ADD CONSTRAINT "review_cases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_case_id_review_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."review_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_cases_tenant_external_reference_unique" ON "review_cases" USING btree ("tenant_id","external_reference");--> statement-breakpoint
CREATE INDEX "review_cases_tenant_status_idx" ON "review_cases" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "review_events_event_hash_unique" ON "review_events" USING btree ("event_hash");--> statement-breakpoint
CREATE INDEX "review_events_case_created_idx" ON "review_events" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "review_events_tenant_created_idx" ON "review_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_memberships_tenant_user_unique" ON "tenant_memberships" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "tenant_memberships_user_idx" ON "tenant_memberships" USING btree ("user_id");