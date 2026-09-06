CREATE OR REPLACE FUNCTION public.establish_hollis_application_session(
  input_subject text,
  input_email text,
  input_email_verified boolean,
  input_display_name text,
  input_avatar_url text,
  input_token_digest text,
  input_expires_at timestamp with time zone
)
RETURNS TABLE (
  "userId" uuid,
  "tenantId" uuid,
  "workspaceName" text,
  "role" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  resolved_user_id uuid;
  resolved_tenant_id uuid;
  resolved_workspace_name text;
  resolved_role text;
BEGIN
  IF length(trim(input_token_digest)) <> 71 OR input_expires_at <= now() THEN
    RAISE EXCEPTION 'A valid session digest and future expiry are required';
  END IF;

  SELECT resolved."userId" INTO resolved_user_id
  FROM public.resolve_identity_platform_user(
    input_subject,
    input_email,
    input_email_verified,
    input_display_name,
    input_avatar_url
  ) AS resolved;

  PERFORM set_config('app.identity_resolution', 'enabled', true);

  SELECT membership.tenant_id, tenant.name, membership.role
  INTO resolved_tenant_id, resolved_workspace_name, resolved_role
  FROM public.tenant_memberships AS membership
  INNER JOIN public.tenants AS tenant ON tenant.id = membership.tenant_id
  WHERE membership.user_id = resolved_user_id
  ORDER BY membership.created_at ASC, membership.id ASC
  LIMIT 1;

  INSERT INTO public.application_sessions (
    active_tenant_id,
    expires_at,
    token_digest,
    user_id
  )
  VALUES (
    resolved_tenant_id,
    input_expires_at,
    input_token_digest,
    resolved_user_id
  );

  RETURN QUERY SELECT resolved_user_id, resolved_tenant_id, resolved_workspace_name, resolved_role;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.read_hollis_application_session(
  input_token_digest text
)
RETURNS TABLE (
  "userId" uuid,
  "tenantId" uuid,
  "workspaceName" text,
  "role" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF length(trim(input_token_digest)) <> 71 THEN
    RETURN;
  END IF;

  PERFORM set_config('app.identity_resolution', 'enabled', true);

  UPDATE public.application_sessions
  SET last_seen_at = now()
  WHERE token_digest = input_token_digest
    AND revoked_at IS NULL
    AND expires_at > now();

  RETURN QUERY
  SELECT
    session.user_id,
    session.active_tenant_id,
    tenant.name,
    membership.role
  FROM public.application_sessions AS session
  LEFT JOIN public.tenant_memberships AS membership
    ON membership.user_id = session.user_id
    AND membership.tenant_id = session.active_tenant_id
  LEFT JOIN public.tenants AS tenant ON tenant.id = session.active_tenant_id
  WHERE session.token_digest = input_token_digest
    AND session.revoked_at IS NULL
    AND session.expires_at > now();
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.activate_hollis_workspace(
  input_token_digest text,
  input_tenant_id uuid
)
RETURNS TABLE (
  "userId" uuid,
  "tenantId" uuid,
  "workspaceName" text,
  "role" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  resolved_user_id uuid;
  resolved_workspace_name text;
  resolved_role text;
BEGIN
  IF length(trim(input_token_digest)) <> 71 THEN
    RETURN;
  END IF;

  PERFORM set_config('app.identity_resolution', 'enabled', true);

  SELECT session.user_id INTO resolved_user_id
  FROM public.application_sessions AS session
  WHERE session.token_digest = input_token_digest
    AND session.revoked_at IS NULL
    AND session.expires_at > now()
  FOR UPDATE;

  IF resolved_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT tenant.name, membership.role
  INTO resolved_workspace_name, resolved_role
  FROM public.tenant_memberships AS membership
  INNER JOIN public.tenants AS tenant ON tenant.id = membership.tenant_id
  WHERE membership.user_id = resolved_user_id
    AND membership.tenant_id = input_tenant_id;

  IF resolved_role IS NULL THEN
    RAISE EXCEPTION 'The selected workspace is not a membership of this user';
  END IF;

  UPDATE public.application_sessions
  SET active_tenant_id = input_tenant_id, last_seen_at = now()
  WHERE token_digest = input_token_digest;

  RETURN QUERY SELECT resolved_user_id, input_tenant_id, resolved_workspace_name, resolved_role;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.revoke_hollis_application_session(
  input_token_digest text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  did_revoke boolean;
BEGIN
  IF length(trim(input_token_digest)) <> 71 THEN
    RETURN false;
  END IF;

  PERFORM set_config('app.identity_resolution', 'enabled', true);

  UPDATE public.application_sessions
  SET revoked_at = coalesce(revoked_at, now())
  WHERE token_digest = input_token_digest
    AND expires_at > now()
  RETURNING true INTO did_revoke;

  RETURN coalesce(did_revoke, false);
END;
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.establish_hollis_application_session(text, text, boolean, text, text, text, timestamp with time zone) TO hollis_app;
GRANT EXECUTE ON FUNCTION public.read_hollis_application_session(text) TO hollis_app;
GRANT EXECUTE ON FUNCTION public.activate_hollis_workspace(text, uuid) TO hollis_app;
GRANT EXECUTE ON FUNCTION public.revoke_hollis_application_session(text) TO hollis_app;
