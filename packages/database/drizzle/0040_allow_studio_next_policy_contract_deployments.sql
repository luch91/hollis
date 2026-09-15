ALTER TABLE public.policy_contract_deployments
  DROP CONSTRAINT policy_contract_deployments_network_check;
--> statement-breakpoint

ALTER TABLE public.policy_contract_deployments
  ADD CONSTRAINT policy_contract_deployments_network_check
  CHECK (network IN ('studio-dev', 'studio-next'));
