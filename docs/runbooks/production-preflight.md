# Production Preflight Checklist

Status: a required approval checklist, not deployment authorization. Complete every applicable item with evidence before requesting a production deployment.

## Architecture and ownership

- [ ] Deployment provider, account or project, region, and data-residency decision are recorded and approved.
- [ ] The selected runtime, database, object storage, secret mechanism, scheduler, logging, and alerting architecture is documented.
- [ ] The account remains on its approved plan. Any upgrade requires explicit owner authorization outside this checklist.
- [ ] A named service owner, security owner, and on-call or incident contact are recorded.

## Identity and workspace controls

- [ ] Google, GitHub, and verified email-and-password sign-in have passed controlled acceptance tests.
- [ ] Identity Platform authorized domains and OAuth callback values are verified for the exact console origin.
- [ ] New users reach onboarding only and cannot access another tenant without workspace membership.
- [ ] Workspace creation, invitation issue, invitation acceptance, role change, revocation, and last-owner protection have passed acceptance tests.

## Data and storage

- [ ] Migration and runtime database identities are separate. Runtime is `NOSUPERUSER` and `NOBYPASSRLS`.
- [ ] Database network access is private and row-level-security integration tests pass against the target-compatible database.
- [ ] Exactly one evidence provider is configured and its bucket is private, encrypted, and least-privilege.
- [ ] Signed upload, verification, download, retention deletion, failed-delete retry, and legal hold pass against the selected provider with synthetic data.
- [ ] Backup objectives are approved and a restoration exercise is recorded using [backup-and-recovery.md](backup-and-recovery.md).

## Application security and operations

- [ ] `pnpm verify` and `pnpm audit --prod` pass from the release commit.
- [ ] Public and high-cost routes have tested rate limits. A shared or edge limiter is configured for multi-instance deployment.
- [ ] TLS, HTTPS console origin, CORS origin, headers, session lifetime, logging, and error responses are verified.
- [ ] Monitoring, alerting, log retention, and an abuse-response procedure are active and tested.
- [ ] The incident-response process is approved and exercised using [incident-response.md](incident-response.md).
- [ ] An application security review or penetration test appropriate to the deployment scope is complete.

## Attestation and external integrations

- [ ] Claims-webhook intake remains closed unless its tenant-resolution design, sender identity, secret rotation, replay controls, and acceptance tests are approved.
- [ ] `PUBLIC_ATTESTATION_ORIGIN` is configured only when it is the verified HTTPS API origin and returns only the approved public-safe schema.
- [ ] The validated Studio Dev V6 contract address, fee profile, and transaction procedure are recorded for the current release. No Hollis signing key is held by the importer.

## Release authorization

- [ ] Preflight evidence has been reviewed by the designated owners.
- [ ] Rollback or forward-repair plan is documented for the exact release.
- [ ] Deployment occurs through the approved identity and change record.
- [ ] Post-deployment checks confirm liveness, authentication, tenant isolation, review workflow, storage, export, and logging.
