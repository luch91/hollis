CREATE OR REPLACE FUNCTION public.list_hollis_retention_job_tenants()
RETURNS TABLE("tenantId" uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT DISTINCT job.tenant_id
  FROM public.retention_deletion_jobs AS job
  WHERE (
      job.status IN ('pending', 'failed')
      OR (job.status = 'processing' AND job.lease_expires_at <= now())
    )
    AND job.available_at <= now()
  ORDER BY job.tenant_id
$$;

REVOKE ALL ON FUNCTION public.list_hollis_retention_job_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_hollis_retention_job_tenants() TO hollis_app;
