ALTER TABLE "tenants" ALTER COLUMN "workos_organization_id" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "workos_user_id" DROP NOT NULL;
ALTER TABLE "tenant_memberships" ALTER COLUMN "workos_membership_id" DROP NOT NULL;

ALTER TABLE "users" ADD COLUMN "email" text;
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN "display_name" text;
ALTER TABLE "users" ADD COLUMN "avatar_url" text;

CREATE TABLE "identity_accounts" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity_accounts" ADD CONSTRAINT "identity_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "identity_accounts_provider_subject_unique" ON "identity_accounts" USING btree ("provider","provider_subject");
--> statement-breakpoint
CREATE INDEX "identity_accounts_user_idx" ON "identity_accounts" USING btree ("user_id");
--> statement-breakpoint

CREATE TABLE "application_sessions" (
	"active_tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"token_digest" text NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "application_sessions_token_digest_unique" UNIQUE("token_digest")
);
--> statement-breakpoint
ALTER TABLE "application_sessions" ADD CONSTRAINT "application_sessions_active_tenant_id_tenants_id_fk" FOREIGN KEY ("active_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_sessions" ADD CONSTRAINT "application_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "application_sessions_user_idx" ON "application_sessions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "application_sessions_active_tenant_idx" ON "application_sessions" USING btree ("active_tenant_id");
--> statement-breakpoint

CREATE TABLE "workspace_invitations" (
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"token_digest" text NOT NULL,
	CONSTRAINT "workspace_invitations_token_digest_unique" UNIQUE("token_digest")
);
--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "workspace_invitations_tenant_email_idx" ON "workspace_invitations" USING btree ("tenant_id","email");
--> statement-breakpoint
CREATE INDEX "workspace_invitations_expiry_idx" ON "workspace_invitations" USING btree ("expires_at");
--> statement-breakpoint

ALTER TABLE "identity_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "identity_accounts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "application_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "application_sessions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "workspace_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_invitations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY "tenants_organization_isolation" ON "tenants";
CREATE POLICY "tenants_workspace_isolation" ON "tenants"
  USING (
    "id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    OR current_setting('app.identity_resolution', true) = 'enabled'
  )
  WITH CHECK (
    "id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    OR current_setting('app.workspace_provisioning', true) = 'enabled'
  );
--> statement-breakpoint
DROP POLICY "tenant_memberships_isolation" ON "tenant_memberships";
CREATE POLICY "tenant_memberships_workspace_isolation" ON "tenant_memberships"
  USING (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    OR current_setting('app.identity_resolution', true) = 'enabled'
  )
  WITH CHECK (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    OR current_setting('app.workspace_provisioning', true) = 'enabled'
  );
--> statement-breakpoint
CREATE POLICY "users_identity_resolution" ON "users"
  FOR ALL
  USING (current_setting('app.identity_resolution', true) = 'enabled')
  WITH CHECK (current_setting('app.identity_resolution', true) = 'enabled');
--> statement-breakpoint
CREATE POLICY "identity_accounts_resolution" ON "identity_accounts"
  FOR ALL
  USING (current_setting('app.identity_resolution', true) = 'enabled')
  WITH CHECK (current_setting('app.identity_resolution', true) = 'enabled');
--> statement-breakpoint
CREATE POLICY "application_sessions_resolution" ON "application_sessions"
  FOR ALL
  USING (current_setting('app.identity_resolution', true) = 'enabled')
  WITH CHECK (current_setting('app.identity_resolution', true) = 'enabled');
--> statement-breakpoint
CREATE POLICY "workspace_invitations_tenant_isolation" ON "workspace_invitations"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.resolve_identity_platform_user(
  input_subject text,
  input_email text,
  input_email_verified boolean,
  input_display_name text,
  input_avatar_url text
)
RETURNS TABLE ("userId" uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  resolved_user_id uuid;
  normalized_email text;
BEGIN
  IF length(trim(input_subject)) = 0 OR length(trim(input_email)) = 0 OR NOT input_email_verified THEN
    RAISE EXCEPTION 'Identity Platform subject and verified email are required';
  END IF;

  normalized_email := lower(trim(input_email));
  PERFORM set_config('app.identity_resolution', 'enabled', true);

  SELECT user_id INTO resolved_user_id
  FROM public.identity_accounts
  WHERE provider = 'identity_platform'
    AND provider_subject = input_subject
  LIMIT 1;

  IF resolved_user_id IS NULL THEN
    INSERT INTO public.users (email, email_verified_at, display_name, avatar_url)
    VALUES (
      normalized_email,
      now(),
      nullif(trim(input_display_name), ''),
      nullif(trim(input_avatar_url), '')
    )
    RETURNING id INTO resolved_user_id;

    INSERT INTO public.identity_accounts (
      email,
      email_verified_at,
      provider,
      provider_subject,
      user_id
    )
    VALUES (normalized_email, now(), 'identity_platform', input_subject, resolved_user_id);
  ELSE
    UPDATE public.users
    SET
      email = normalized_email,
      email_verified_at = now(),
      display_name = coalesce(nullif(trim(input_display_name), ''), display_name),
      avatar_url = coalesce(nullif(trim(input_avatar_url), ''), avatar_url)
    WHERE id = resolved_user_id;

    UPDATE public.identity_accounts
    SET email = normalized_email, email_verified_at = now()
    WHERE provider = 'identity_platform'
      AND provider_subject = input_subject;
  END IF;

  RETURN QUERY SELECT resolved_user_id;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.provision_public_hollis_workspace(
  input_name text,
  input_user_id uuid
)
RETURNS TABLE ("tenantId" uuid, "workspaceName" text, "role" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  resolved_tenant_id uuid := gen_random_uuid();
  normalized_name text := trim(input_name);
BEGIN
  IF length(normalized_name) < 2 OR length(normalized_name) > 120 THEN
    RAISE EXCEPTION 'Workspace name must be between 2 and 120 characters';
  END IF;

  PERFORM set_config('app.tenant_id', resolved_tenant_id::text, true);
  PERFORM set_config('app.workspace_provisioning', 'enabled', true);

  INSERT INTO public.tenants (id, name)
  VALUES (resolved_tenant_id, normalized_name);

  INSERT INTO public.tenant_memberships (role, tenant_id, user_id)
  VALUES ('owner', resolved_tenant_id, input_user_id);

  RETURN QUERY SELECT resolved_tenant_id, normalized_name, 'owner'::text;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.provision_hollis_tenant(text, text, text, text, text) FROM hollis_app;
REVOKE ALL ON FUNCTION public.provision_hollis_tenant(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_identity_platform_user(text, text, boolean, text, text) TO hollis_app;
GRANT EXECUTE ON FUNCTION public.provision_public_hollis_workspace(text, uuid) TO hollis_app;
