# Local verification record: 2026-09-10

This record captures a local verification run against the Docker Compose PostgreSQL instance. It is not a production acceptance record and does not make compliance, fairness, or availability claims.

## Environment

- PostgreSQL 18 Compose service, bound only to `127.0.0.1:5434`.
- API on `http://127.0.0.1:4000`.
- Web application on `http://localhost:3001`.
- No AWS resource, account-plan setting, billing setting, or cloud deployment was created or modified for this run.

## Verified paths

| Path | Evidence | Result |
| --- | --- | --- |
| Database migrations | `pnpm db:migrate` | Applied successfully, including runtime-grant repair migration `0027_harden_runtime_grants`. |
| Tenant isolation and runtime grants | `DATABASE_TEST_URL=... pnpm --filter @hollis/database test:integration` | 6 tests passed. The test covers tenant context isolation, cross-tenant insert rejection, public case-file retrieval by exact identifier, immutable attestation case files, and public workspace provisioning through the approved function. |
| Review workflow persistence | `DATABASE_TEST_URL=... DATABASE_URL=... pnpm --filter @hollis/api test:integration` | 7 tests passed. The test covers case creation, idempotent replay, changed-content rejection, reviewer claim, escalation, reassignment, human decision, export, and transaction rollback. |
| API startup with configured GCS storage | `GET /health/live` after a normal local API start | Returned HTTP 200 with `{ "status": "ok" }`. Google credential resolution is deferred until a storage operation. |
| Protected browser route | Browser visit to `/app` without a Hollis session | Redirected to `/sign-in`. |
| Protected API route | `GET /v1/review-cases` without a bearer token | Returned HTTP 401 with the documented authentication error. |
| Public sign-in surface | Browser visit to `/sign-in` | Rendered Google, GitHub, and email-and-password sign-in controls. |

## Corrected during this run

- Migration `0015_grant_runtime_table_access` had restored `UPDATE` permission on immutable public attestation case files after an earlier revoke. Migration `0027_harden_runtime_grants` revokes `UPDATE` and `DELETE` from `hollis_app` again.
- Database integration tests still asserted retired WorkOS organization resolution and provisioning behavior. They now test tenant-ID resolution and the active Identity Platform public-workspace provisioning function.
- Google credential resolution occurred while constructing the evidence adapter, blocking local API startup when local Application Default Credentials were unavailable. The adapter now resolves credentials only when a storage operation is requested.

## Not verified locally

- Completing a real Google, GitHub, or email-and-password Identity Platform sign-in.
- Evidence upload, signed-URL upload, verification, and download against a cloud bucket. These require valid storage credentials and a deliberately selected provider runtime.
- Public case-file publication, Studio Dev submission, and finalized GenLayer import. Local configuration does not set `PUBLIC_ATTESTATION_ORIGIN` or `GENLAYER_STUDIO_CONTRACT_ADDRESS`.
- Vercel production delivery, custom-domain behavior, AWS runtime deployment, backup recovery, and cloud-network controls.

These items remain deployment or provider-verification work. They must not be represented as locally verified.
