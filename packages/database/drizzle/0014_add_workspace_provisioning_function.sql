CREATE OR REPLACE FUNCTION public.provision_hollis_tenant(
  input_organization_name text,
  input_workos_organization_id text,
  input_workos_user_id text,
  input_workos_membership_id text,
  input_role text
)
RETURNS TABLE ("organizationId" text, "tenantId" uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  resolved_tenant_id uuid;
  resolved_user_id uuid;
BEGIN
  PERFORM set_config('app.workos_organization_id', input_workos_organization_id, true);

  INSERT INTO public.tenants (name, workos_organization_id)
  VALUES (input_organization_name, input_workos_organization_id)
  ON CONFLICT (workos_organization_id) DO UPDATE
    SET name = EXCLUDED.name
  RETURNING id INTO resolved_tenant_id;

  PERFORM set_config('app.tenant_id', resolved_tenant_id::text, true);
  PERFORM set_config('app.workspace_provisioning', 'enabled', true);

  INSERT INTO public.users (workos_user_id)
  VALUES (input_workos_user_id)
  ON CONFLICT (workos_user_id) DO UPDATE
    SET workos_user_id = EXCLUDED.workos_user_id
  RETURNING id INTO resolved_user_id;

  INSERT INTO public.tenant_memberships (
    role,
    tenant_id,
    user_id,
    workos_membership_id
  )
  VALUES (
    input_role,
    resolved_tenant_id,
    resolved_user_id,
    input_workos_membership_id
  )
  ON CONFLICT (workos_membership_id) DO UPDATE
    SET role = EXCLUDED.role;

  RETURN QUERY SELECT input_workos_organization_id, resolved_tenant_id;
END;
$$;

CREATE POLICY "users_workspace_provisioning" ON "users"
  FOR INSERT
  WITH CHECK (
    current_setting('app.workspace_provisioning', true) = 'enabled'
  );

CREATE POLICY "tenant_memberships_workspace_provisioning" ON "tenant_memberships"
  FOR INSERT
  WITH CHECK (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND current_setting('app.workspace_provisioning', true) = 'enabled'
  );

REVOKE ALL ON FUNCTION public.provision_hollis_tenant(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_hollis_tenant(text, text, text, text, text) TO hollis_app;
