ALTER TABLE "tenants" ADD COLUMN "industry" text;
ALTER TABLE "tenants" ADD COLUMN "operating_region" text;
ALTER TABLE "tenants" ADD COLUMN "website" text;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON TABLE "workspace_invitations" TO hollis_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.accept_hollis_workspace_invitation(
  input_token_digest text,
  input_user_id uuid
)
RETURNS TABLE ("tenantId" uuid, "workspaceName" text, "role" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  invitation_record public.workspace_invitations%ROWTYPE;
  verified_email text;
  resolved_workspace_name text;
BEGIN
  IF length(trim(input_token_digest)) <> 71 THEN
    RETURN;
  END IF;

  PERFORM set_config('app.identity_resolution', 'enabled', true);
  SELECT * INTO invitation_record
  FROM public.workspace_invitations
  WHERE token_digest = input_token_digest
    AND accepted_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF invitation_record.id IS NULL THEN
    RETURN;
  END IF;

  SELECT lower(email) INTO verified_email
  FROM public.identity_accounts
  WHERE user_id = input_user_id
    AND provider = 'identity_platform'
  LIMIT 1;

  IF verified_email IS NULL OR verified_email <> lower(invitation_record.email) THEN
    RAISE EXCEPTION 'Invitation recipient does not match the authenticated identity';
  END IF;

  INSERT INTO public.tenant_memberships (role, tenant_id, user_id)
  VALUES (invitation_record.role, invitation_record.tenant_id, input_user_id)
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  UPDATE public.workspace_invitations
  SET accepted_at = now(), accepted_by_user_id = input_user_id
  WHERE id = invitation_record.id;

  SELECT name INTO resolved_workspace_name FROM public.tenants WHERE id = invitation_record.tenant_id;
  RETURN QUERY SELECT invitation_record.tenant_id, resolved_workspace_name, invitation_record.role;
END;
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.accept_hollis_workspace_invitation(text, uuid) TO hollis_app;
