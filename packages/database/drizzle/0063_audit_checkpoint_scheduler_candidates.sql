CREATE OR REPLACE FUNCTION public.list_hollis_audit_checkpoint_candidates()
RETURNS TABLE("caseId" uuid, "tenantId" uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT DISTINCT event.case_id, event.tenant_id
  FROM public.review_events AS event
  ORDER BY event.tenant_id, event.case_id;
$$;
REVOKE ALL ON FUNCTION public.list_hollis_audit_checkpoint_candidates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_hollis_audit_checkpoint_candidates() TO hollis_app;
