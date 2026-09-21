-- A linear case chain has exactly one child for every non-genesis event.
CREATE UNIQUE INDEX "review_events_case_previous_hash_unique"
  ON "review_events" ("case_id", "previous_hash")
  WHERE "previous_hash" IS NOT NULL;

-- Workspace audit writes use the same tenant-scoped serialization rule.
CREATE UNIQUE INDEX "workspace_audit_events_tenant_previous_hash_unique"
  ON "workspace_audit_events" ("tenant_id", "previous_hash")
  WHERE "previous_hash" IS NOT NULL;

CREATE OR REPLACE FUNCTION public.append_hollis_workspace_audit_event(
  input_tenant_id uuid,
  input_actor_id uuid,
  input_event_type text,
  input_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  previous_event_hash text;
  calculated_event_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(input_tenant_id::text, 0));
  SELECT event_hash INTO previous_event_hash
  FROM public.workspace_audit_events
  WHERE tenant_id = input_tenant_id
  ORDER BY event_sequence DESC
  LIMIT 1;

  calculated_event_hash := 'sha256:' || encode(
    digest(
      jsonb_build_object(
        'actorId', input_actor_id,
        'eventType', input_event_type,
        'payload', input_payload,
        'previousHash', previous_event_hash,
        'tenantId', input_tenant_id
      )::text,
      'sha256'
    ),
    'hex'
  );
  INSERT INTO public.workspace_audit_events(
    actor_id, event_hash, event_type, payload, previous_hash, tenant_id
  ) VALUES(
    input_actor_id, calculated_event_hash, input_event_type, input_payload,
    previous_event_hash, input_tenant_id
  );
END;
$$;
