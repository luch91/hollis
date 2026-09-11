CREATE TYPE public.notification_delivery_status AS ENUM ('pending', 'sending', 'sent', 'failed');
--> statement-breakpoint

CREATE TABLE public.account_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  notification_type text NOT NULL,
  status public.notification_delivery_status NOT NULL DEFAULT 'pending',
  provider_message_id text,
  attempted_at timestamp with time zone,
  delivered_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT account_notification_deliveries_notification_type_check
    CHECK (notification_type = 'welcome')
);
--> statement-breakpoint

CREATE UNIQUE INDEX account_notification_deliveries_user_type_unique
  ON public.account_notification_deliveries USING btree (user_id, notification_type);
--> statement-breakpoint

CREATE INDEX account_notification_deliveries_status_idx
  ON public.account_notification_deliveries USING btree (status, created_at);
--> statement-breakpoint

ALTER TABLE public.account_notification_deliveries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP FUNCTION public.establish_hollis_application_session(text, text, boolean, text, text, text, timestamp with time zone);
--> statement-breakpoint

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
  "sessionId" uuid,
  "userId" uuid,
  "tenantId" uuid,
  "workspaceName" text,
  "role" text,
  "isNewUser" boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  resolved_session_id uuid;
  resolved_user_id uuid;
  resolved_tenant_id uuid;
  resolved_workspace_name text;
  resolved_role text;
  resolved_user_was_created boolean;
BEGIN
  IF length(trim(input_token_digest)) <> 71 OR input_expires_at <= now() THEN
    RAISE EXCEPTION 'A valid session digest and future expiry are required';
  END IF;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.identity_accounts
    WHERE provider = 'identity_platform'
      AND provider_subject = input_subject
  ) INTO resolved_user_was_created;

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
  )
  RETURNING id INTO resolved_session_id;

  RETURN QUERY SELECT
    resolved_session_id,
    resolved_user_id,
    resolved_tenant_id,
    resolved_workspace_name,
    resolved_role,
    resolved_user_was_created;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.record_hollis_welcome_email_delivery(input_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.account_notification_deliveries (notification_type, user_id)
  VALUES ('welcome', input_user_id)
  ON CONFLICT (user_id, notification_type) DO NOTHING;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.claim_hollis_welcome_email_delivery(input_user_id uuid)
RETURNS TABLE (
  "deliveryId" uuid,
  "recipientEmail" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.account_notification_deliveries AS delivery
  SET status = 'sending', attempted_at = now()
  FROM public.users AS account
  WHERE delivery.user_id = input_user_id
    AND delivery.user_id = account.id
    AND delivery.notification_type = 'welcome'
    AND delivery.status = 'pending'
  RETURNING delivery.id, account.email;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.complete_hollis_welcome_email_delivery(
  input_delivery_id uuid,
  input_status public.notification_delivery_status,
  input_provider_message_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  updated_count integer;
BEGIN
  IF input_status NOT IN ('sent', 'failed') THEN
    RAISE EXCEPTION 'Welcome email delivery can only be completed as sent or failed';
  END IF;

  UPDATE public.account_notification_deliveries
  SET
    status = input_status,
    provider_message_id = CASE WHEN input_status = 'sent' THEN nullif(trim(input_provider_message_id), '') ELSE NULL END,
    delivered_at = CASE WHEN input_status = 'sent' THEN now() ELSE NULL END
  WHERE id = input_delivery_id
    AND notification_type = 'welcome'
    AND status = 'sending';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count = 1;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON TABLE public.account_notification_deliveries FROM PUBLIC;
REVOKE ALL ON TABLE public.account_notification_deliveries FROM hollis_app;
REVOKE ALL ON FUNCTION public.record_hollis_welcome_email_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_hollis_welcome_email_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_hollis_welcome_email_delivery(uuid, public.notification_delivery_status, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.establish_hollis_application_session(text, text, boolean, text, text, text, timestamp with time zone) TO hollis_app;
GRANT EXECUTE ON FUNCTION public.record_hollis_welcome_email_delivery(uuid) TO hollis_app;
GRANT EXECUTE ON FUNCTION public.claim_hollis_welcome_email_delivery(uuid) TO hollis_app;
GRANT EXECUTE ON FUNCTION public.complete_hollis_welcome_email_delivery(uuid, public.notification_delivery_status, text) TO hollis_app;
