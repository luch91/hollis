CREATE OR REPLACE FUNCTION public.list_hollis_workspace_members(
  input_tenant_id uuid,
  input_actor_id uuid
)
RETURNS TABLE (
  "userId" uuid,
  "role" text,
  "displayName" text,
  "email" text,
  "avatarUrl" text,
  "joinedAt" timestamp with time zone
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

  IF actor_role IS NULL THEN
    RAISE EXCEPTION 'Workspace membership required';
  END IF;

  RETURN QUERY
  SELECT
    membership.user_id,
    membership.role,
    workspace_user.display_name,
    CASE
      WHEN actor_role IN ('owner', 'administrator') OR membership.user_id = input_actor_id
        THEN workspace_user.email
      ELSE NULL
    END,
    CASE
      WHEN actor_role IN ('owner', 'administrator') OR membership.user_id = input_actor_id
        THEN workspace_user.avatar_url
      ELSE NULL
    END,
    membership.created_at
  FROM public.tenant_memberships AS membership
  INNER JOIN public.users AS workspace_user ON workspace_user.id = membership.user_id
  WHERE membership.tenant_id = input_tenant_id
  ORDER BY workspace_user.display_name NULLS LAST, membership.created_at, membership.user_id;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.list_hollis_workspace_members(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_hollis_workspace_members(uuid, uuid) TO hollis_app;
