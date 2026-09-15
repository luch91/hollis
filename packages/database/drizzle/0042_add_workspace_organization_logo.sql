ALTER TABLE public.tenants
  ADD COLUMN logo_digest text,
  ADD COLUMN logo_media_type text,
  ADD COLUMN logo_object_name text,
  ADD COLUMN logo_source_host text,
  ADD COLUMN logo_updated_at timestamptz,
  ADD COLUMN logo_updated_by_user_id uuid REFERENCES public.users(id);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.set_hollis_workspace_logo(
  input_tenant_id uuid,
  input_actor_id uuid,
  input_object_name text,
  input_digest text,
  input_media_type text,
  input_source_host text
)
RETURNS TABLE (
  "id" uuid,
  "logoDigest" text,
  "logoMediaType" text,
  "logoObjectName" text,
  "logoSourceHost" text,
  "logoUpdatedAt" timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
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

  IF input_object_name !~ ('^tenants/' || input_tenant_id::text || '/organization-logo/[a-f0-9]{64}$')
    OR input_digest !~ '^sha256:[a-f0-9]{64}$'
    OR input_media_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
    OR length(trim(input_source_host)) NOT BETWEEN 1 AND 253 THEN
    RAISE EXCEPTION 'Organization logo metadata is invalid';
  END IF;

  UPDATE public.tenants AS workspace
  SET
    logo_digest = input_digest,
    logo_media_type = input_media_type,
    logo_object_name = input_object_name,
    logo_source_host = lower(trim(input_source_host)),
    logo_updated_at = now(),
    logo_updated_by_user_id = input_actor_id
  WHERE workspace.id = input_tenant_id;

  PERFORM public.append_hollis_workspace_audit_event(
    input_tenant_id,
    input_actor_id,
    'workspace_logo_updated',
    jsonb_build_object(
      'digest', input_digest,
      'mediaType', input_media_type,
      'sourceHost', lower(trim(input_source_host))
    )
  );

  RETURN QUERY
  SELECT
    workspace.id,
    workspace.logo_digest,
    workspace.logo_media_type,
    workspace.logo_object_name,
    workspace.logo_source_host,
    workspace.logo_updated_at
  FROM public.tenants AS workspace
  WHERE workspace.id = input_tenant_id;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.remove_hollis_workspace_logo(
  input_tenant_id uuid,
  input_actor_id uuid
)
RETURNS TABLE ("objectName" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  actor_role text;
  removed_object_name text;
BEGIN
  SELECT membership.role INTO actor_role
  FROM public.tenant_memberships AS membership
  WHERE membership.tenant_id = input_tenant_id
    AND membership.user_id = input_actor_id;

  IF actor_role NOT IN ('owner', 'administrator') THEN
    RAISE EXCEPTION 'Workspace management permission required';
  END IF;

  SELECT logo_object_name INTO removed_object_name
  FROM public.tenants
  WHERE id = input_tenant_id
  FOR UPDATE;

  IF removed_object_name IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.tenants
  SET
    logo_digest = NULL,
    logo_media_type = NULL,
    logo_object_name = NULL,
    logo_source_host = NULL,
    logo_updated_at = now(),
    logo_updated_by_user_id = input_actor_id
  WHERE id = input_tenant_id;

  PERFORM public.append_hollis_workspace_audit_event(
    input_tenant_id,
    input_actor_id,
    'workspace_logo_removed',
    jsonb_build_object('objectDigest', encode(digest(removed_object_name, 'sha256'), 'hex'))
  );

  RETURN QUERY SELECT removed_object_name;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.set_hollis_workspace_logo(uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_hollis_workspace_logo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_hollis_workspace_logo(uuid, uuid, text, text, text, text) TO hollis_app;
GRANT EXECUTE ON FUNCTION public.remove_hollis_workspace_logo(uuid, uuid) TO hollis_app;
