-- Discover expired evidence directly, rather than only looking at jobs that
-- happened to have been queued by a prior process invocation.
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
  UNION
  SELECT DISTINCT evidence.tenant_id
  FROM public.evidence_objects AS evidence
  INNER JOIN public.evidence_attachments AS attachment
    ON attachment.evidence_object_id = evidence.id
   AND attachment.tenant_id = evidence.tenant_id
  INNER JOIN public.review_cases AS review_case
    ON review_case.id = attachment.case_id
   AND review_case.tenant_id = attachment.tenant_id
  WHERE attachment.state = 'active'
    AND evidence.verified = true
    AND evidence.deleted_at IS NULL
    AND evidence.legal_hold = 'none'
    AND evidence.retention_until <= now()
    AND review_case.status = 'completed';
$$;

-- A deleted object is terminal for retention purposes and cannot receive a
-- new hold mutation that would misleadingly imply it is preservable.
CREATE OR REPLACE FUNCTION public.set_hollis_evidence_legal_hold(
  input_tenant_id uuid,
  input_case_id uuid,
  input_attachment_id uuid,
  input_active boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.evidence_objects AS evidence
  SET legal_hold = CASE WHEN input_active THEN 'active' ELSE 'none' END
  FROM public.evidence_attachments AS attachment
  WHERE attachment.evidence_object_id = evidence.id
    AND attachment.tenant_id = input_tenant_id
    AND attachment.case_id = input_case_id
    AND attachment.id = input_attachment_id
    AND attachment.state = 'active'
    AND evidence.deleted_at IS NULL;
  RETURN found;
END;
$$;
