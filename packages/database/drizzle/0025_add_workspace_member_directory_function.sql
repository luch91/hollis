CREATE OR REPLACE FUNCTION public.list_hollis_workspace_members(input_tenant_id uuid, input_actor_id uuid)
RETURNS TABLE ("userId" uuid, "role" text, "displayName" text, "email" text, "avatarUrl" text, "joinedAt" timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor_role text;
BEGIN
  SELECT role INTO actor_role FROM public.tenant_memberships WHERE tenant_id=input_tenant_id AND user_id=input_actor_id;
  IF actor_role NOT IN ('owner','administrator') THEN RAISE EXCEPTION 'Workspace management permission required'; END IF;
  RETURN QUERY
  SELECT membership.user_id, membership.role, workspace_user.display_name, workspace_user.email, workspace_user.avatar_url, membership.created_at
  FROM public.tenant_memberships membership
  JOIN public.users workspace_user ON workspace_user.id=membership.user_id
  WHERE membership.tenant_id=input_tenant_id
  ORDER BY workspace_user.email;
END; $$;
GRANT EXECUTE ON FUNCTION public.list_hollis_workspace_members(uuid,uuid) TO hollis_app;
