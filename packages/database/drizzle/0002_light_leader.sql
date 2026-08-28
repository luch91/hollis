DROP INDEX "review_cases_tenant_status_idx";--> statement-breakpoint
ALTER TABLE "review_cases" ADD COLUMN "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_cases" ADD COLUMN "assigned_to_user_id" text;--> statement-breakpoint
ALTER TABLE "review_cases" ADD COLUMN "decision_outcome" text;--> statement-breakpoint
ALTER TABLE "review_cases" ADD COLUMN "decision_rationale" text;--> statement-breakpoint
ALTER TABLE "review_cases" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_cases" ADD COLUMN "decided_by_user_id" text;--> statement-breakpoint
ALTER TABLE "review_cases" ADD COLUMN "evidence" jsonb;--> statement-breakpoint
ALTER TABLE "review_cases" ADD COLUMN "escalation_reason" text;--> statement-breakpoint
ALTER TABLE "review_cases" ADD COLUMN "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_cases" ADD COLUMN "escalated_by_user_id" text;--> statement-breakpoint
ALTER TABLE "review_cases" ADD COLUMN "final_recommendation" text;--> statement-breakpoint
ALTER TABLE "review_cases" ADD COLUMN "review_due_at" timestamp with time zone;--> statement-breakpoint
UPDATE "review_cases" AS cases
SET "evidence" = COALESCE(
  (
    SELECT events."payload" -> 'evidence'
    FROM "review_events" AS events
    WHERE events."case_id" = cases."id"
      AND events."event_type" = 'case_created'
    ORDER BY events."created_at" ASC
    LIMIT 1
  ),
  '[]'::jsonb
);--> statement-breakpoint
ALTER TABLE "review_cases" ALTER COLUMN "evidence" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "review_cases_tenant_queue_idx" ON "review_cases" USING btree ("tenant_id","status","review_due_at","created_at");
