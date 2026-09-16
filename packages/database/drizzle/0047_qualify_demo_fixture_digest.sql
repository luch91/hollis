CREATE OR REPLACE FUNCTION public.seed_hollis_demo_workspace(input_tenant_id uuid, input_actor_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  policy_id uuid;
  case_id uuid;
  evidence_id uuid;
  evidence_digest text := 'sha256:' || repeat('a', 64);
  expires_at timestamptz := now() + interval '14 days';
  inserted_count integer := 0;
BEGIN
  PERFORM set_config('app.tenant_id', input_tenant_id::text, true);
  IF EXISTS (
    SELECT 1
    FROM public.demo_workspace_fixtures AS d
    WHERE d.tenant_id = input_tenant_id
      AND d.expires_at > now()
  ) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.policy_versions (created_by_user_id, document_digest, policy_id, source_file_name, source_media_type, source_size_bytes, tenant_id, title, version)
  VALUES (input_actor_id, evidence_digest, 'asterion-demo-governance-2026', 'asterion-demo-policy.txt', 'text/plain', 1, input_tenant_id, 'Asterion Demo Governance Standard', '1.0')
  RETURNING id INTO policy_id;

  INSERT INTO public.policy_controls (attestation_criterion, control_id, control_version, evidence_requirement, interpretation, policy_version_id, tenant_id, title)
  VALUES ('A human reviewer must record an outcome before a consequential decision proceeds.', 'human-review-required', '1.0', 'verified_reference_required', 'judgment_required', policy_id, input_tenant_id, 'Independent human approval');

  FOREACH case_id IN ARRAY ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()] LOOP
    evidence_id := gen_random_uuid();
    evidence_digest := 'sha256:' || encode(extensions.digest(convert_to(case_id::text, 'utf8'), 'sha256'), 'hex');
    INSERT INTO public.review_cases (automated_system_version, evidence, external_reference, id, intake_fingerprint, policy_id, policy_version, recommendation, risk_level, review_due_at, rule_id, tenant_id)
    VALUES ('asterion-demo-gate-1.0', jsonb_build_array(jsonb_build_object('digest', evidence_digest, 'id', evidence_id, 'mediaType', 'text/plain')), 'DEMO-ASTERION-' || substr(case_id::text, 1, 8), case_id, evidence_digest, 'asterion-demo-governance-2026', '1.0', 'refer', 'high', now() + interval '7 days', 'human-review-required', input_tenant_id);
    INSERT INTO public.evidence_objects (case_id, digest, media_type, object_name, size_bytes, tenant_id, verified)
    VALUES (case_id, evidence_digest, 'text/plain', 'tenants/' || input_tenant_id::text || '/demo/' || evidence_id::text, 1, input_tenant_id, true);
    INSERT INTO public.review_events (actor_id, case_id, event_hash, event_type, payload, previous_hash, tenant_id)
    VALUES (input_actor_id::text, case_id, 'sha256:' || encode(extensions.digest(convert_to(case_id::text || expires_at::text, 'utf8'), 'sha256'), 'hex'), 'case_created', jsonb_build_object('demo', true, 'policyId', 'asterion-demo-governance-2026', 'ruleId', 'human-review-required'), null, input_tenant_id);
    INSERT INTO public.demo_workspace_fixtures (case_id, expires_at, policy_version_id, tenant_id)
    VALUES (case_id, expires_at, policy_id, input_tenant_id);
    inserted_count := inserted_count + 1;
  END LOOP;
  RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_hollis_demo_workspace(uuid, uuid) TO hollis_app;
