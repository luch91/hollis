CREATE OR REPLACE FUNCTION public.cleanup_expired_hollis_demo_workspace(input_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  removed_count integer;
BEGIN
  PERFORM set_config('app.tenant_id', input_tenant_id::text, true);
  SELECT count(*) INTO removed_count
  FROM public.demo_workspace_fixtures AS d
  WHERE d.tenant_id = input_tenant_id
    AND d.expires_at <= now();

  DELETE FROM public.retention_deletion_jobs AS r
  WHERE r.tenant_id = input_tenant_id
    AND r.case_id IN (
      SELECT d.case_id FROM public.demo_workspace_fixtures AS d
      WHERE d.tenant_id = input_tenant_id AND d.expires_at <= now()
    );
  DELETE FROM public.managed_attestation_submissions AS s
  WHERE s.tenant_id = input_tenant_id
    AND s.case_id IN (
      SELECT d.case_id FROM public.demo_workspace_fixtures AS d
      WHERE d.tenant_id = input_tenant_id AND d.expires_at <= now()
    );
  DELETE FROM public.public_attestation_case_files AS p
  WHERE p.tenant_id = input_tenant_id
    AND p.case_id IN (
      SELECT d.case_id FROM public.demo_workspace_fixtures AS d
      WHERE d.tenant_id = input_tenant_id AND d.expires_at <= now()
    );
  DELETE FROM public.attestations AS a
  WHERE a.tenant_id = input_tenant_id
    AND a.case_id IN (
      SELECT d.case_id FROM public.demo_workspace_fixtures AS d
      WHERE d.tenant_id = input_tenant_id AND d.expires_at <= now()
    );
  DELETE FROM public.review_events AS e
  WHERE e.tenant_id = input_tenant_id
    AND e.case_id IN (
      SELECT d.case_id FROM public.demo_workspace_fixtures AS d
      WHERE d.tenant_id = input_tenant_id AND d.expires_at <= now()
    );
  DELETE FROM public.evidence_objects AS e
  WHERE e.tenant_id = input_tenant_id
    AND e.case_id IN (
      SELECT d.case_id FROM public.demo_workspace_fixtures AS d
      WHERE d.tenant_id = input_tenant_id AND d.expires_at <= now()
    );
  DELETE FROM public.review_cases AS c
  WHERE c.tenant_id = input_tenant_id
    AND c.id IN (
      SELECT d.case_id FROM public.demo_workspace_fixtures AS d
      WHERE d.tenant_id = input_tenant_id AND d.expires_at <= now()
    );
  DELETE FROM public.policy_versions AS p
  WHERE p.tenant_id = input_tenant_id
    AND p.id IN (
      SELECT d.policy_version_id FROM public.demo_workspace_fixtures AS d
      WHERE d.tenant_id = input_tenant_id AND d.expires_at <= now()
    );
  DELETE FROM public.demo_workspace_fixtures AS d
  WHERE d.tenant_id = input_tenant_id AND d.expires_at <= now();
  RETURN coalesce(removed_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_hollis_demo_workspace(uuid) TO hollis_app;
