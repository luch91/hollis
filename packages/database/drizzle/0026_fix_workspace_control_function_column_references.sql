CREATE OR REPLACE FUNCTION public.list_hollis_workspace_members(input_tenant_id uuid, input_actor_id uuid)
RETURNS TABLE ("userId" uuid, "role" text, "displayName" text, "email" text, "avatarUrl" text, "joinedAt" timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor_role text;
BEGIN
  SELECT membership.role INTO actor_role FROM public.tenant_memberships membership WHERE membership.tenant_id=input_tenant_id AND membership.user_id=input_actor_id;
  IF actor_role NOT IN ('owner','administrator') THEN RAISE EXCEPTION 'Workspace management permission required'; END IF;
  RETURN QUERY SELECT membership.user_id,membership.role,workspace_user.display_name,workspace_user.email,workspace_user.avatar_url,membership.created_at FROM public.tenant_memberships membership JOIN public.users workspace_user ON workspace_user.id=membership.user_id WHERE membership.tenant_id=input_tenant_id ORDER BY workspace_user.email;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.create_hollis_workspace_invitation(input_tenant_id uuid,input_actor_id uuid,input_email text,input_role text,input_token_digest text)
RETURNS TABLE ("id" uuid,"email" text,"role" text,"expiresAt" timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor_role text; created_record public.workspace_invitations%ROWTYPE;
BEGIN
  SELECT membership.role INTO actor_role FROM public.tenant_memberships membership WHERE membership.tenant_id=input_tenant_id AND membership.user_id=input_actor_id;
  IF actor_role NOT IN ('owner','administrator') THEN RAISE EXCEPTION 'Workspace management permission required'; END IF;
  IF input_role NOT IN ('administrator','reviewer','contributor','auditor') THEN RAISE EXCEPTION 'Invitation role is invalid'; END IF;
  IF actor_role='administrator' AND input_role='administrator' THEN RAISE EXCEPTION 'Only an owner may invite an administrator'; END IF;
  IF length(trim(input_token_digest)) <> 71 THEN RAISE EXCEPTION 'Invitation token digest is invalid'; END IF;
  INSERT INTO public.workspace_invitations(email,expires_at,invited_by_user_id,role,tenant_id,token_digest) VALUES(lower(trim(input_email)),now()+interval '7 days',input_actor_id,input_role,input_tenant_id,input_token_digest) RETURNING * INTO created_record;
  PERFORM public.append_hollis_workspace_audit_event(input_tenant_id,input_actor_id,'workspace_invitation_created',jsonb_build_object('invitationId',created_record.id,'role',created_record.role));
  RETURN QUERY SELECT created_record.id,created_record.email,created_record.role,created_record.expires_at;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.update_hollis_workspace_member_role(input_tenant_id uuid,input_actor_id uuid,input_member_id uuid,input_role text)
RETURNS TABLE ("userId" uuid,"role" text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor_role text; member_role text;
BEGIN
  SELECT membership.role INTO actor_role FROM public.tenant_memberships membership WHERE membership.tenant_id=input_tenant_id AND membership.user_id=input_actor_id;
  SELECT membership.role INTO member_role FROM public.tenant_memberships membership WHERE membership.tenant_id=input_tenant_id AND membership.user_id=input_member_id FOR UPDATE;
  IF actor_role NOT IN ('owner','administrator') OR member_role IS NULL THEN RAISE EXCEPTION 'Workspace management permission required'; END IF;
  IF input_role NOT IN ('administrator','reviewer','contributor','auditor') OR member_role='owner' THEN RAISE EXCEPTION 'Role change is not allowed'; END IF;
  IF actor_role='administrator' AND (input_role='administrator' OR member_role='administrator') THEN RAISE EXCEPTION 'Only an owner may manage administrators'; END IF;
  UPDATE public.tenant_memberships SET role=input_role WHERE tenant_id=input_tenant_id AND user_id=input_member_id;
  PERFORM public.append_hollis_workspace_audit_event(input_tenant_id,input_actor_id,'workspace_member_role_updated',jsonb_build_object('memberId',input_member_id,'role',input_role));
  RETURN QUERY SELECT input_member_id,input_role;
END; $$;
