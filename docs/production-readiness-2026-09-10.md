# Production Readiness Review

Date: 2026-09-10

This is a code and local-verification review. It does not certify legal compliance, operational readiness, or a production deployment.

## Evidence reviewed

- Repository policy, formatting, linting, TypeScript checks, unit tests, integration tests, and production build were run locally.
- Production dependency audit was run locally after the pinned storage SDK updates and returned no known production vulnerabilities.
- PostgreSQL integration tests passed against the local Docker Compose database.
- The persistent review workflow integration suite passed against the configured local database.
- The API liveness endpoint returned HTTP 200 locally. Protected browser and API routes rejected unauthenticated access.
- `docs/local-verification-2026-09-10.md` records the exact local verification boundary.

## Findings that are ready in the codebase

- The API validates production configuration for HTTPS browser origin, a claims webhook secret, a configured evidence provider, and the required host binding.
- Evidence storage has provider-neutral interfaces. Google Cloud Storage and S3 adapters keep objects tenant-scoped and expose signed object URLs.
- The review workflow records tenant-scoped review cases, evidence metadata, reviewer decisions, exports, and append-only events.
- Database migration `0027_harden_runtime_grants` restores the intended immutability boundary for public attestation case files by revoking runtime `UPDATE` and `DELETE` access.
- Identity Platform is the active user-authentication design. Workspace access remains an explicit Hollis membership and is not inferred from an identity-provider account.
- The GenLayer importer is read-only and Studio Dev is documented as non-production validation only.

## Production blockers

### Deployment target is not settled or available

The repository's deployment material still describes Cloud Run and WorkOS, while the active product decision uses Identity Platform for public authentication and the current infrastructure evaluation is AWS. The AWS EC2 quota request remains unresolved. There is no approved, runnable production API target in this review.

Before deployment, select one current target architecture and replace or explicitly retire the conflicting runbooks. The selected target must include the API, database, private evidence storage, secret delivery, outbound public attestation endpoint, scheduled retention execution, logging, alerting, and recovery operations.

### Retention scheduler is not provider-neutral

`apps/api/src/retention-scheduler.ts` imports and constructs only `createGoogleCloudEvidenceStorage`. If production evidence is stored in S3, the scheduler cannot process its deletion jobs. This must be corrected and verified against the selected provider before production use.

### Live provider paths are not verified

The following must be exercised in the selected production-like environment using non-sensitive test data:

- Google, GitHub, and email-and-password sign-in, account linking, session renewal, sign-out, and password recovery.
- Workspace creation, invitation delivery or controlled link acceptance, role changes, and revocation.
- Evidence upload, download, integrity verification, legal hold, retention-job execution, and deletion recovery behavior against the selected storage provider.
- Public-safe case-file publication, Studio Dev import, transaction-verdict validation, and receipt export. Studio Dev does not satisfy a production attestation requirement.
- Browser, API, database, storage, and scheduled-job failure handling.

### Operational controls are incomplete

The threat model and non-negotiables require incident response, backup verification, restoration exercises, retention/deletion procedures, and an application security review before production use. This review found no verified backup-and-restore exercise or current incident runbook.

No application-level rate-limit implementation was found in the API source. Define and test limits for sign-in/session exchange, workspace provisioning, invitations, uploads, claims webhooks, attestation imports, and exports, with an abuse-response procedure.

### Documentation needs alignment

The following documents contain legacy WorkOS and/or Cloud Run statements that conflict with the active Identity Platform and AWS evaluation decisions:

- `README.md`
- `docs/deployment.md`
- `docs/architecture.md`
- `docs/database-security.md`
- ADRs `0005`, `0006`, `0009`, and `0013`

They must be revised only after the production target is selected. Until then, they are not a valid deployment runbook.

## Required production exit criteria

1. Approve one deployment architecture and region based on data residency, operations, and cost requirements.
2. Provision that target under least privilege without changing the AWS account from its free plan unless the owner explicitly authorizes it.
3. Make the retention scheduler select the configured evidence provider and verify it end to end.
4. Add rate limits and observable abuse handling for public and high-cost routes.
5. Complete real-provider acceptance tests with synthetic data and record results.
6. Establish backup, restore, retention, deletion, monitoring, alerting, incident response, and vulnerability-management runbooks. Execute and record at least one restoration exercise.
7. Complete an independent application security review or penetration test appropriate to the data and deployment scope.
8. Update the deployment and architecture documentation to match the approved implementation, then complete a deliberate production preflight.

## Scope statement

No AWS, Google Cloud, Vercel, database, storage, authentication-provider, billing, or account-plan setting was changed for this review.
