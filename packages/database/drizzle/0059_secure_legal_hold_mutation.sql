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
    AND attachment.state = 'active';
  RETURN found;
END;
$$;

REVOKE ALL ON FUNCTION public.set_hollis_evidence_legal_hold(uuid, uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_hollis_evidence_legal_hold(uuid, uuid, uuid, boolean) TO hollis_app;
