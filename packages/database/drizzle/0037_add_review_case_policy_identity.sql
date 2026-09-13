ALTER TABLE public.review_cases ADD COLUMN policy_id text;
--> statement-breakpoint

CREATE INDEX review_cases_tenant_policy_identity_idx
  ON public.review_cases (tenant_id, policy_id, policy_version, rule_id);
