-- Demo fixtures were synthetic onboarding data. Remove every fixture and its
-- dependent review records before retiring the fixture table and functions.
DELETE FROM public.retention_deletion_jobs AS job
WHERE job.case_id IN (SELECT fixture.case_id FROM public.demo_workspace_fixtures AS fixture);

DELETE FROM public.managed_attestation_submissions AS submission
WHERE submission.case_id IN (SELECT fixture.case_id FROM public.demo_workspace_fixtures AS fixture);

DELETE FROM public.public_attestation_case_files AS case_file
WHERE case_file.case_id IN (SELECT fixture.case_id FROM public.demo_workspace_fixtures AS fixture);

DELETE FROM public.attestations AS attestation
WHERE attestation.case_id IN (SELECT fixture.case_id FROM public.demo_workspace_fixtures AS fixture);

DELETE FROM public.review_events AS event
WHERE event.case_id IN (SELECT fixture.case_id FROM public.demo_workspace_fixtures AS fixture);

DELETE FROM public.evidence_objects AS evidence
WHERE evidence.case_id IN (SELECT fixture.case_id FROM public.demo_workspace_fixtures AS fixture);

DELETE FROM public.review_cases AS review_case
WHERE review_case.id IN (SELECT fixture.case_id FROM public.demo_workspace_fixtures AS fixture);

DELETE FROM public.policy_contract_deployments AS deployment
WHERE deployment.policy_control_record_id IN (
  SELECT control.id
  FROM public.policy_controls AS control
  WHERE control.policy_version_id IN (
    SELECT fixture.policy_version_id FROM public.demo_workspace_fixtures AS fixture
  )
);

DELETE FROM public.policy_controls AS control
WHERE control.policy_version_id IN (
  SELECT fixture.policy_version_id FROM public.demo_workspace_fixtures AS fixture
);

DELETE FROM public.policy_versions AS policy
WHERE policy.id IN (SELECT fixture.policy_version_id FROM public.demo_workspace_fixtures AS fixture);

DROP FUNCTION IF EXISTS public.cleanup_expired_hollis_demo_workspace(uuid);
DROP FUNCTION IF EXISTS public.seed_hollis_demo_workspace(uuid, uuid);
DROP TABLE public.demo_workspace_fixtures;
