# Incident Response Runbook

Status: required before production activation. This document establishes the response process; it does not claim that monitoring, paging, or external support arrangements are already configured.

## Trigger conditions

Open an incident for suspected or confirmed:

- cross-tenant access or authorization bypass;
- leaked credential, session token, invitation token, webhook secret, or signing key;
- evidence corruption, unexpected deletion, or digest mismatch;
- review-event mutation, broken audit chain, or public case-file exposure outside the approved schema;
- abnormal authentication, invitation, upload, export, webhook, or attestation-import activity;
- unavailable database, evidence store, API, or recovery control;
- attempted production deployment outside the approved runbook.

## First response

1. Assign an incident commander and record the start time, reporter, affected system, and known tenant scope.
2. Preserve evidence. Do not delete logs, rotate secrets without recording the old-secret containment plan, or run retention deletion on impacted records.
3. Contain the smallest viable boundary: revoke a session, invitation, credential, workload identity, or external integration only when authorized and documented.
4. For suspected cross-tenant access, disable the affected route or tenant access path before making data repairs.
5. For a public-attestation concern, disable publisher or importer configuration rather than changing a published record. Public case files are immutable by design.
6. Do not use a broad database role, disable row-level security, or grant elevated permissions to speed diagnosis.

## Investigation

Collect allowlisted facts only: request IDs, timestamps, route names, response classes, tenant and user identifiers where authorized, deployment version, storage object reference, event sequence, and transaction identifiers. Keep raw evidence, tokens, credentials, personal data, and secrets out of general incident notes.

Determine whether data confidentiality, integrity, availability, tenant isolation, evidence provenance, review outcome, or public case-file privacy is affected. Record the evidence supporting each conclusion and the remaining uncertainty.

## Eradication and recovery

Use the backup-and-recovery runbook for restoration. Rotate compromised credentials through the approved secret mechanism. Revoke affected sessions and invitations. Apply reviewed forward repairs, not destructive rollback shortcuts. Retest tenant isolation, audit integrity, and affected workflow controls before re-enabling service.

## Communication and closure

The designated business owner determines customer, regulator, insurer, or partner notification obligations with appropriate counsel. Hollis must not make legal-compliance claims from this technical runbook.

Close an incident only after containment, recovery validation, impact assessment, owner approval, and corrective-action tracking are complete. Record the timeline, root cause or unresolved hypothesis, affected scope, actions, and follow-up owner.
