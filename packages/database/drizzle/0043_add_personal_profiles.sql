ALTER TABLE public.users
  ADD COLUMN bio text,
  ADD COLUMN job_title text,
  ADD COLUMN profile_avatar_digest text,
  ADD COLUMN profile_avatar_media_type text,
  ADD COLUMN profile_avatar_object_name text,
  ADD COLUMN profile_avatar_tenant_id uuid REFERENCES public.tenants(id),
  ADD COLUMN profile_avatar_updated_at timestamptz,
  ADD COLUMN time_zone text;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.get_hollis_user_profile(input_user_id uuid)
RETURNS TABLE (
  "avatarUrl" text,
  "bio" text,
  "displayName" text,
  "email" text,
  "emailVerifiedAt" timestamptz,
  "jobTitle" text,
  "profileAvatarDigest" text,
  "profileAvatarMediaType" text,
  "profileAvatarObjectName" text,
  "profileAvatarTenantId" uuid,
  "profileAvatarUpdatedAt" timestamptz,
  "timeZone" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM set_config('app.identity_resolution', 'enabled', true);
  RETURN QUERY
  SELECT
    account.avatar_url,
    account.bio,
    account.display_name,
    account.email,
    account.email_verified_at,
    account.job_title,
    account.profile_avatar_digest,
    account.profile_avatar_media_type,
    account.profile_avatar_object_name,
    account.profile_avatar_tenant_id,
    account.profile_avatar_updated_at,
    account.time_zone
  FROM public.users AS account
  WHERE account.id = input_user_id;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.update_hollis_user_profile(
  input_user_id uuid,
  input_display_name text,
  input_job_title text,
  input_time_zone text,
  input_bio text
)
RETURNS TABLE (
  "avatarUrl" text,
  "bio" text,
  "displayName" text,
  "email" text,
  "emailVerifiedAt" timestamptz,
  "jobTitle" text,
  "profileAvatarDigest" text,
  "profileAvatarMediaType" text,
  "profileAvatarObjectName" text,
  "profileAvatarTenantId" uuid,
  "profileAvatarUpdatedAt" timestamptz,
  "timeZone" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  normalized_display_name text := nullif(trim(input_display_name), '');
  normalized_job_title text := nullif(trim(input_job_title), '');
  normalized_time_zone text := nullif(trim(input_time_zone), '');
  normalized_bio text := nullif(trim(input_bio), '');
BEGIN
  IF normalized_display_name IS NULL OR length(normalized_display_name) > 120
    OR (normalized_job_title IS NOT NULL AND length(normalized_job_title) > 120)
    OR (normalized_time_zone IS NOT NULL AND length(normalized_time_zone) > 100)
    OR (normalized_bio IS NOT NULL AND length(normalized_bio) > 500) THEN
    RAISE EXCEPTION 'Personal profile values are invalid';
  END IF;

  PERFORM set_config('app.identity_resolution', 'enabled', true);
  UPDATE public.users AS account
  SET
    bio = normalized_bio,
    display_name = normalized_display_name,
    job_title = normalized_job_title,
    time_zone = normalized_time_zone
  WHERE account.id = input_user_id;

  RETURN QUERY SELECT * FROM public.get_hollis_user_profile(input_user_id);
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.set_hollis_user_profile_avatar(
  input_user_id uuid,
  input_tenant_id uuid,
  input_object_name text,
  input_digest text,
  input_media_type text
)
RETURNS TABLE (
  "previousObjectName" text,
  "previousTenantId" uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  prior_object_name text;
  prior_tenant_id uuid;
BEGIN
  IF input_object_name !~ ('^tenants/' || input_tenant_id::text || '/user-profiles/' || input_user_id::text || '/[a-f0-9]{64}$')
    OR input_digest !~ '^sha256:[a-f0-9]{64}$'
    OR input_media_type NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
    RAISE EXCEPTION 'Profile avatar metadata is invalid';
  END IF;

  PERFORM set_config('app.identity_resolution', 'enabled', true);
  SELECT account.profile_avatar_object_name, account.profile_avatar_tenant_id
  INTO prior_object_name, prior_tenant_id
  FROM public.users AS account
  WHERE account.id = input_user_id
  FOR UPDATE;

  UPDATE public.users AS account
  SET
    profile_avatar_digest = input_digest,
    profile_avatar_media_type = input_media_type,
    profile_avatar_object_name = input_object_name,
    profile_avatar_tenant_id = input_tenant_id,
    profile_avatar_updated_at = now()
  WHERE account.id = input_user_id;

  RETURN QUERY SELECT prior_object_name, prior_tenant_id;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.remove_hollis_user_profile_avatar(input_user_id uuid)
RETURNS TABLE (
  "previousObjectName" text,
  "previousTenantId" uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  prior_object_name text;
  prior_tenant_id uuid;
BEGIN
  PERFORM set_config('app.identity_resolution', 'enabled', true);
  SELECT account.profile_avatar_object_name, account.profile_avatar_tenant_id
  INTO prior_object_name, prior_tenant_id
  FROM public.users AS account
  WHERE account.id = input_user_id
  FOR UPDATE;

  UPDATE public.users AS account
  SET
    profile_avatar_digest = NULL,
    profile_avatar_media_type = NULL,
    profile_avatar_object_name = NULL,
    profile_avatar_tenant_id = NULL,
    profile_avatar_updated_at = CASE WHEN prior_object_name IS NULL THEN account.profile_avatar_updated_at ELSE now() END
  WHERE account.id = input_user_id;

  RETURN QUERY SELECT prior_object_name, prior_tenant_id;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.get_hollis_user_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_hollis_user_profile(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_hollis_user_profile_avatar(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_hollis_user_profile_avatar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hollis_user_profile(uuid) TO hollis_app;
GRANT EXECUTE ON FUNCTION public.update_hollis_user_profile(uuid, text, text, text, text) TO hollis_app;
GRANT EXECUTE ON FUNCTION public.set_hollis_user_profile_avatar(uuid, uuid, text, text, text) TO hollis_app;
GRANT EXECUTE ON FUNCTION public.remove_hollis_user_profile_avatar(uuid) TO hollis_app;
