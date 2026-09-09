ALTER TABLE "workspace_invitations" ADD COLUMN "revoked_at" timestamp with time zone;
ALTER TABLE "workspace_invitations" ADD COLUMN "revoked_by_user_id" uuid REFERENCES "users"("id");
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.update_hollis_workspace_profile(
  input_tenant_id uuid, input_actor_id uuid, input_name text, input_industry text,
  input_operating_region text, input_website text
)
RETURNS TABLE ("id" uuid, "name" text, "industry" text, "operatingRegion" text, "website" text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor_role text;
BEGIN
  SELECT role INTO actor_role FROM public.tenant_memberships
  WHERE tenant_id = input_tenant_id AND user_id = input_actor_id;
  IF actor_role NOT IN ('owner', 'administrator') THEN RAISE EXCEPTION 'Workspace management permission required'; END IF;
  IF length(trim(input_name)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Workspace name is invalid'; END IF;
  UPDATE public.tenants SET name = trim(input_name), industry = nullif(trim(input_industry), ''),
    operating_region = nullif(trim(input_operating_region), ''), website = nullif(trim(input_website), '')
  WHERE id = input_tenant_id;
  RETURN QUERY SELECT id, name, industry, operating_region, website FROM public.tenants WHERE id = input_tenant_id;
END; $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.update_hollis_workspace_member_role(
  input_tenant_id uuid, input_actor_id uuid, input_member_id uuid, input_role text
)
RETURNS TABLE ("userId" uuid, "role" text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor_role text; member_role text;
BEGIN
  SELECT role INTO actor_role FROM public.tenant_memberships WHERE tenant_id=input_tenant_id AND user_id=input_actor_id;
  SELECT role INTO member_role FROM public.tenant_memberships WHERE tenant_id=input_tenant_id AND user_id=input_member_id FOR UPDATE;
  IF actor_role NOT IN ('owner','administrator') OR member_role IS NULL THEN RAISE EXCEPTION 'Workspace management permission required'; END IF;
  IF input_role NOT IN ('administrator','reviewer','contributor','auditor') OR member_role='owner' THEN RAISE EXCEPTION 'Role change is not allowed'; END IF;
  IF actor_role='administrator' AND (input_role='administrator' OR member_role='administrator') THEN RAISE EXCEPTION 'Only an owner may manage administrators'; END IF;
  UPDATE public.tenant_memberships SET role=input_role WHERE tenant_id=input_tenant_id AND user_id=input_member_id;
  RETURN QUERY SELECT input_member_id, input_role;
END; $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.revoke_hollis_workspace_invitation(
  input_tenant_id uuid, input_actor_id uuid, input_invitation_id uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor_role text;
BEGIN
  SELECT role INTO actor_role FROM public.tenant_memberships WHERE tenant_id=input_tenant_id AND user_id=input_actor_id;
  IF actor_role NOT IN ('owner','administrator') THEN RAISE EXCEPTION 'Workspace management permission required'; END IF;
  UPDATE public.workspace_invitations SET revoked_at=now(), revoked_by_user_id=input_actor_id
  WHERE id=input_invitation_id AND tenant_id=input_tenant_id AND accepted_at IS NULL AND revoked_at IS NULL;
  RETURN found;
END; $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.list_hollis_user_workspaces(input_user_id uuid)
RETURNS TABLE ("tenantId" uuid, "workspaceName" text, "role" text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT t.id, t.name, m.role FROM public.tenant_memberships m
  JOIN public.tenants t ON t.id=m.tenant_id WHERE m.user_id=input_user_id ORDER BY t.name;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.accept_hollis_workspace_invitation(input_token_digest text, input_user_id uuid)
RETURNS TABLE ("tenantId" uuid, "workspaceName" text, "role" text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE invitation_record public.workspace_invitations%ROWTYPE; verified_email text; resolved_workspace_name text;
BEGIN
  IF length(trim(input_token_digest)) <> 71 THEN RETURN; END IF;
  PERFORM set_config('app.identity_resolution', 'enabled', true);
  SELECT * INTO invitation_record FROM public.workspace_invitations
  WHERE token_digest=input_token_digest AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE;
  IF invitation_record.id IS NULL THEN RETURN; END IF;
  SELECT lower(email) INTO verified_email FROM public.identity_accounts WHERE user_id=input_user_id AND provider='identity_platform' LIMIT 1;
  IF verified_email IS NULL OR verified_email <> lower(invitation_record.email) THEN RAISE EXCEPTION 'Invitation recipient does not match the authenticated identity'; END IF;
  INSERT INTO public.tenant_memberships(role,tenant_id,user_id) VALUES(invitation_record.role,invitation_record.tenant_id,input_user_id) ON CONFLICT (tenant_id,user_id) DO NOTHING;
  UPDATE public.workspace_invitations SET accepted_at=now(),accepted_by_user_id=input_user_id WHERE id=invitation_record.id;
  SELECT name INTO resolved_workspace_name FROM public.tenants WHERE id=invitation_record.tenant_id;
  RETURN QUERY SELECT invitation_record.tenant_id,resolved_workspace_name,invitation_record.role;
END; $$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.update_hollis_workspace_profile(uuid,uuid,text,text,text,text) TO hollis_app;
GRANT EXECUTE ON FUNCTION public.update_hollis_workspace_member_role(uuid,uuid,uuid,text) TO hollis_app;
GRANT EXECUTE ON FUNCTION public.revoke_hollis_workspace_invitation(uuid,uuid,uuid) TO hollis_app;
GRANT EXECUTE ON FUNCTION public.list_hollis_user_workspaces(uuid) TO hollis_app;
