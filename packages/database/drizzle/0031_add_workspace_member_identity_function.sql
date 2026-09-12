CREATE OR REPLACE FUNCTION public.get_hollis_workspace_member_identity(
  input_tenant_id uuid,
  input_actor_id uuid,
  input_user_id text
)
RETURNS TABLE (
  "userId" uuid,
  "role" text,
  "displayName" text,
  "email" text,
  "avatarUrl" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS actor_membership
    WHERE actor_membership.tenant_id = input_tenant_id
      AND actor_membership.user_id = input_actor_id
  ) THEN
    RAISE EXCEPTION 'Workspace membership required';
  END IF;

  RETURN QUERY
  SELECT
    workspace_user.id,
    member.role,
    workspace_user.display_name,
    workspace_user.email,
    workspace_user.avatar_url
  FROM public.tenant_memberships AS member
  INNER JOIN public.users AS workspace_user ON workspace_user.id = member.user_id
  WHERE member.tenant_id = input_tenant_id
    AND workspace_user.id::text = input_user_id
  LIMIT 1;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.get_hollis_workspace_member_identity(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hollis_workspace_member_identity(uuid, uuid, text) TO hollis_app;
