CREATE OR REPLACE FUNCTION public.update_hollis_workspace_profile(
  input_tenant_id uuid,
  input_actor_id uuid,
  input_name text,
  input_industry text,
  input_operating_region text,
  input_website text
)
RETURNS TABLE (
  "id" uuid,
  "name" text,
  "industry" text,
  "operatingRegion" text,
  "website" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_role text;
BEGIN
  SELECT membership.role INTO actor_role
  FROM public.tenant_memberships AS membership
  WHERE membership.tenant_id = input_tenant_id
    AND membership.user_id = input_actor_id;

  IF actor_role NOT IN ('owner', 'administrator') THEN
    RAISE EXCEPTION 'Workspace management permission required';
  END IF;

  IF length(trim(input_name)) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Workspace name is invalid';
  END IF;

  UPDATE public.tenants AS workspace
  SET
    name = trim(input_name),
    industry = nullif(trim(input_industry), ''),
    operating_region = nullif(trim(input_operating_region), ''),
    website = nullif(trim(input_website), '')
  WHERE workspace.id = input_tenant_id;

  PERFORM public.append_hollis_workspace_audit_event(
    input_tenant_id,
    input_actor_id,
    'workspace_profile_updated',
    jsonb_build_object(
      'industry', nullif(trim(input_industry), ''),
      'operatingRegion', nullif(trim(input_operating_region), ''),
      'website', nullif(trim(input_website), '')
    )
  );

  RETURN QUERY
  SELECT
    workspace.id,
    workspace.name,
    workspace.industry,
    workspace.operating_region,
    workspace.website
  FROM public.tenants AS workspace
  WHERE workspace.id = input_tenant_id;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.update_hollis_workspace_profile(uuid, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_hollis_workspace_profile(uuid, uuid, text, text, text, text) TO hollis_app;
