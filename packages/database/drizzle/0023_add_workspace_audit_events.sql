CREATE SCHEMA IF NOT EXISTS extensions;
--> statement-breakpoint

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
--> statement-breakpoint

CREATE TABLE "workspace_audit_events" (
  "actor_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "event_hash" text NOT NULL,
  "event_sequence" bigserial NOT NULL,
  "event_type" text NOT NULL,
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payload" jsonb NOT NULL,
  "previous_hash" text,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  CONSTRAINT "workspace_audit_events_event_sequence_unique" UNIQUE("event_sequence"),
  CONSTRAINT "workspace_audit_events_event_hash_unique" UNIQUE("event_hash")
);
--> statement-breakpoint
CREATE INDEX "workspace_audit_events_tenant_created_idx" ON "workspace_audit_events" USING btree ("tenant_id", "created_at");
--> statement-breakpoint
ALTER TABLE "workspace_audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_audit_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "workspace_audit_events_tenant_isolation" ON "workspace_audit_events"
  USING (tenant_id::text = current_setting('app.tenant_id', true));
GRANT SELECT ON TABLE "workspace_audit_events" TO hollis_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.append_hollis_workspace_audit_event(
  input_tenant_id uuid, input_actor_id uuid, input_event_type text, input_payload jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE previous_event_hash text; calculated_event_hash text;
BEGIN
  SELECT event_hash INTO previous_event_hash FROM public.workspace_audit_events
  WHERE tenant_id=input_tenant_id ORDER BY event_sequence DESC LIMIT 1;
  calculated_event_hash := 'sha256:' || encode(digest(jsonb_build_object(
    'actorId', input_actor_id, 'eventType', input_event_type, 'payload', input_payload,
    'previousHash', previous_event_hash, 'tenantId', input_tenant_id
  )::text, 'sha256'), 'hex');
  INSERT INTO public.workspace_audit_events(actor_id,event_hash,event_type,payload,previous_hash,tenant_id)
  VALUES(input_actor_id,calculated_event_hash,input_event_type,input_payload,previous_event_hash,input_tenant_id);
END; $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.create_hollis_workspace_invitation(
  input_tenant_id uuid, input_actor_id uuid, input_email text, input_role text, input_token_digest text
) RETURNS TABLE ("id" uuid, "email" text, "role" text, "expiresAt" timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor_role text; created_record public.workspace_invitations%ROWTYPE;
BEGIN
  SELECT role INTO actor_role FROM public.tenant_memberships WHERE tenant_id=input_tenant_id AND user_id=input_actor_id;
  IF actor_role NOT IN ('owner','administrator') THEN RAISE EXCEPTION 'Workspace management permission required'; END IF;
  IF input_role NOT IN ('administrator','reviewer','contributor','auditor') THEN RAISE EXCEPTION 'Invitation role is invalid'; END IF;
  IF actor_role='administrator' AND input_role='administrator' THEN RAISE EXCEPTION 'Only an owner may invite an administrator'; END IF;
  IF length(trim(input_token_digest)) <> 71 THEN RAISE EXCEPTION 'Invitation token digest is invalid'; END IF;
  INSERT INTO public.workspace_invitations(email,expires_at,invited_by_user_id,role,tenant_id,token_digest)
  VALUES(lower(trim(input_email)),now()+interval '7 days',input_actor_id,input_role,input_tenant_id,input_token_digest)
  RETURNING * INTO created_record;
  PERFORM public.append_hollis_workspace_audit_event(input_tenant_id,input_actor_id,'workspace_invitation_created',jsonb_build_object('invitationId',created_record.id,'role',created_record.role));
  RETURN QUERY SELECT created_record.id,created_record.email,created_record.role,created_record.expires_at;
END; $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.update_hollis_workspace_profile(input_tenant_id uuid,input_actor_id uuid,input_name text,input_industry text,input_operating_region text,input_website text)
RETURNS TABLE ("id" uuid,"name" text,"industry" text,"operatingRegion" text,"website" text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor_role text;
BEGIN
  SELECT role INTO actor_role FROM public.tenant_memberships WHERE tenant_id=input_tenant_id AND user_id=input_actor_id;
  IF actor_role NOT IN ('owner','administrator') THEN RAISE EXCEPTION 'Workspace management permission required'; END IF;
  IF length(trim(input_name)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Workspace name is invalid'; END IF;
  UPDATE public.tenants SET name=trim(input_name),industry=nullif(trim(input_industry),''),operating_region=nullif(trim(input_operating_region),''),website=nullif(trim(input_website),'') WHERE id=input_tenant_id;
  PERFORM public.append_hollis_workspace_audit_event(input_tenant_id,input_actor_id,'workspace_profile_updated',jsonb_build_object('industry',nullif(trim(input_industry),''),'operatingRegion',nullif(trim(input_operating_region),''),'website',nullif(trim(input_website),'')));
  RETURN QUERY SELECT id,name,industry,operating_region,website FROM public.tenants WHERE id=input_tenant_id;
END; $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.update_hollis_workspace_member_role(input_tenant_id uuid,input_actor_id uuid,input_member_id uuid,input_role text)
RETURNS TABLE ("userId" uuid,"role" text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor_role text; member_role text;
BEGIN
  SELECT role INTO actor_role FROM public.tenant_memberships WHERE tenant_id=input_tenant_id AND user_id=input_actor_id;
  SELECT role INTO member_role FROM public.tenant_memberships WHERE tenant_id=input_tenant_id AND user_id=input_member_id FOR UPDATE;
  IF actor_role NOT IN ('owner','administrator') OR member_role IS NULL THEN RAISE EXCEPTION 'Workspace management permission required'; END IF;
  IF input_role NOT IN ('administrator','reviewer','contributor','auditor') OR member_role='owner' THEN RAISE EXCEPTION 'Role change is not allowed'; END IF;
  IF actor_role='administrator' AND (input_role='administrator' OR member_role='administrator') THEN RAISE EXCEPTION 'Only an owner may manage administrators'; END IF;
  UPDATE public.tenant_memberships SET role=input_role WHERE tenant_id=input_tenant_id AND user_id=input_member_id;
  PERFORM public.append_hollis_workspace_audit_event(input_tenant_id,input_actor_id,'workspace_member_role_updated',jsonb_build_object('memberId',input_member_id,'role',input_role));
  RETURN QUERY SELECT input_member_id,input_role;
END; $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.revoke_hollis_workspace_invitation(input_tenant_id uuid,input_actor_id uuid,input_invitation_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor_role text;
BEGIN
  SELECT role INTO actor_role FROM public.tenant_memberships WHERE tenant_id=input_tenant_id AND user_id=input_actor_id;
  IF actor_role NOT IN ('owner','administrator') THEN RAISE EXCEPTION 'Workspace management permission required'; END IF;
  UPDATE public.workspace_invitations SET revoked_at=now(),revoked_by_user_id=input_actor_id WHERE id=input_invitation_id AND tenant_id=input_tenant_id AND accepted_at IS NULL AND revoked_at IS NULL;
  IF found THEN PERFORM public.append_hollis_workspace_audit_event(input_tenant_id,input_actor_id,'workspace_invitation_revoked',jsonb_build_object('invitationId',input_invitation_id)); END IF;
  RETURN found;
END; $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.accept_hollis_workspace_invitation(input_token_digest text,input_user_id uuid)
RETURNS TABLE ("tenantId" uuid,"workspaceName" text,"role" text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE invitation_record public.workspace_invitations%ROWTYPE; verified_email text; resolved_workspace_name text;
BEGIN
  IF length(trim(input_token_digest)) <> 71 THEN RETURN; END IF;
  PERFORM set_config('app.identity_resolution','enabled',true);
  SELECT * INTO invitation_record FROM public.workspace_invitations WHERE token_digest=input_token_digest AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE;
  IF invitation_record.id IS NULL THEN RETURN; END IF;
  SELECT lower(email) INTO verified_email FROM public.identity_accounts WHERE user_id=input_user_id AND provider='identity_platform' LIMIT 1;
  IF verified_email IS NULL OR verified_email <> lower(invitation_record.email) THEN RAISE EXCEPTION 'Invitation recipient does not match the authenticated identity'; END IF;
  INSERT INTO public.tenant_memberships(role,tenant_id,user_id) VALUES(invitation_record.role,invitation_record.tenant_id,input_user_id) ON CONFLICT (tenant_id,user_id) DO NOTHING;
  UPDATE public.workspace_invitations SET accepted_at=now(),accepted_by_user_id=input_user_id WHERE id=invitation_record.id;
  PERFORM public.append_hollis_workspace_audit_event(invitation_record.tenant_id,input_user_id,'workspace_invitation_accepted',jsonb_build_object('invitationId',invitation_record.id,'role',invitation_record.role));
  SELECT name INTO resolved_workspace_name FROM public.tenants WHERE id=invitation_record.tenant_id;
  RETURN QUERY SELECT invitation_record.tenant_id,resolved_workspace_name,invitation_record.role;
END; $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_hollis_workspace_invitation(uuid,uuid,text,text,text) TO hollis_app;
