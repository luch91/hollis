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
  stage integer := 0;
  stage_status public.review_status;
  stage_event_hash text;
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
    stage := stage + 1;
    evidence_id := gen_random_uuid();
    evidence_digest := 'sha256:' || encode(extensions.digest(convert_to(case_id::text, 'utf8'), 'sha256'), 'hex');
    stage_status := CASE stage WHEN 1 THEN 'pending'::public.review_status WHEN 2 THEN 'in_review'::public.review_status ELSE 'completed'::public.review_status END;
    INSERT INTO public.review_cases (assigned_to_user_id, automated_system_version, decision_outcome, decision_rationale, decided_at, decided_by_user_id, evidence, external_reference, final_recommendation, id, intake_fingerprint, policy_id, policy_version, recommendation, risk_level, review_due_at, rule_id, status, tenant_id)
    VALUES (
      CASE WHEN stage > 1 THEN input_actor_id::text ELSE null END,
      'asterion-demo-gate-1.0',
      CASE WHEN stage = 3 THEN 'approved' ELSE null END,
      CASE WHEN stage = 3 THEN 'Synthetic demo decision recorded for workflow demonstration.' ELSE null END,
      CASE WHEN stage = 3 THEN now() ELSE null END,
      CASE WHEN stage = 3 THEN input_actor_id::text ELSE null END,
      jsonb_build_array(jsonb_build_object('digest', evidence_digest, 'id', evidence_id, 'mediaType', 'text/plain')),
      'DEMO-ASTERION-' || substr(case_id::text, 1, 8),
      CASE WHEN stage = 3 THEN 'approve' ELSE null END,
      case_id,
      evidence_digest,
      'asterion-demo-governance-2026',
      '1.0',
      'refer',
      CASE WHEN stage = 3 THEN 'medium' ELSE 'high' END,
      now() + interval '7 days',
      'human-review-required',
      stage_status,
      input_tenant_id
    );
    INSERT INTO public.evidence_objects (case_id, digest, media_type, object_name, size_bytes, tenant_id, verified)
    VALUES (case_id, evidence_digest, 'text/plain', 'tenants/' || input_tenant_id::text || '/demo/' || evidence_id::text, 1, input_tenant_id, true);
    stage_event_hash := 'sha256:' || encode(extensions.digest(convert_to(case_id::text || expires_at::text || stage::text, 'utf8'), 'sha256'), 'hex');
    INSERT INTO public.review_events (actor_id, case_id, event_hash, event_type, payload, previous_hash, tenant_id)
    VALUES (input_actor_id::text, case_id, stage_event_hash, 'case_created', jsonb_build_object('demo', true, 'stage', stage, 'policyId', 'asterion-demo-governance-2026', 'ruleId', 'human-review-required'), null, input_tenant_id);
    IF stage > 1 THEN
      INSERT INTO public.review_events (actor_id, case_id, event_hash, event_type, payload, previous_hash, tenant_id)
      VALUES (input_actor_id::text, case_id, 'sha256:' || encode(extensions.digest(convert_to(case_id::text || expires_at::text || stage::text || 'review', 'utf8'), 'sha256'), 'hex'), 'review_started', jsonb_build_object('demo', true, 'stage', stage), stage_event_hash, input_tenant_id);
    END IF;
    IF stage = 3 THEN
      INSERT INTO public.review_events (actor_id, case_id, event_hash, event_type, payload, previous_hash, tenant_id)
      VALUES (input_actor_id::text, case_id, 'sha256:' || encode(extensions.digest(convert_to(case_id::text || expires_at::text || 'decision', 'utf8'), 'sha256'), 'hex'), 'decision_recorded', jsonb_build_object('demo', true, 'outcome', 'approved'), 'sha256:' || encode(extensions.digest(convert_to(case_id::text || expires_at::text || stage::text || 'review', 'utf8'), 'sha256'), 'hex'), input_tenant_id);
    END IF;
    INSERT INTO public.demo_workspace_fixtures (case_id, expires_at, policy_version_id, tenant_id)
    VALUES (case_id, expires_at, policy_id, input_tenant_id);
    inserted_count := inserted_count + 1;
  END LOOP;
  RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_hollis_demo_workspace(uuid, uuid) TO hollis_app;
