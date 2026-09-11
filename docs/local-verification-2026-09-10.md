# Local verification record: 2026-09-10

This record captures a local verification run against the Docker Compose PostgreSQL instance. It is not a production acceptance record and does not make compliance, fairness, or availability claims.

## Follow-up verification: 2026-09-11

The following checks were repeated after the Studio Dev release-environment documentation alignment. They did not create, modify, or upgrade any AWS resource or account setting.

| Path | Evidence | Result |
| --- | --- | --- |
| Repository release gate | `pnpm verify` | Passed repository policy, formatting, linting, TypeScript checks, 7 shared-contract tests, 9 web tests, 73 API tests, and the production build. The existing stylesheet lint warnings remain non-failing and include the required reduced-motion overrides. |
| Production dependency audit | `pnpm audit --prod` | No known production dependency vulnerabilities reported. |
| Tenant isolation and runtime grants | Local Compose integration run | 6 tests passed. |
| Review workflow persistence | Local Compose integration run | 7 tests passed. |
| Local services | `GET /health/live` and `GET /sign-in` | Both returned HTTP 200 from the existing local API and web processes. |
| Studio Dev identity | `pnpm genlayer:check-studio` | The canonical Studio Dev RPC returned chain ID `61997`. This was read-only and did not submit a transaction. |
| Public web deployment | HTTPS checks against `thehollis.xyz` and `www.thehollis.xyz` | The apex redirects and the canonical Vercel web application returns HTTP 200. `https://www.thehollis.xyz/health/live` and the public attestation-case-file route both return HTTP 404, so the web origin is not an API origin and must not be used as `PUBLIC_ATTESTATION_ORIGIN`. |

The local environment still does not configure `PUBLIC_ATTESTATION_ORIGIN` or `GENLAYER_STUDIO_CONTRACT_ADDRESS`. It therefore cannot publish a public-safe case file, import a finalized Studio Dev transaction, or exercise that workflow end to end. This is an unverified configuration boundary, not a failed application test.

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

## Synthetic acceptance pass

The following acceptance pass used only the local Docker Compose PostgreSQL database and synthetic identifiers. It did not contact Google Cloud, AWS, Vercel, Identity Platform, an object-storage bucket, or GenLayer.

| Workflow boundary | Evidence | Result |
| --- | --- | --- |
| Published policy-control validation | API policy-library tests | A case binding is checked against an existing published policy control and version. |
| Case intake and audit record | Persistent API integration test | A pending case and its first append-only event were stored atomically. Matching intake replay was idempotent and changed content was rejected. |
| Human review lifecycle | Persistent API integration test | Claim, escalation, reviewer handoff, rationale-backed decision, and rejection of a second decision all passed. |
| Evidence metadata export | Persistent API integration test | A tenant-scoped export preserved evidence references, ordered events, and a manifest hash. |
| Tenant and public-case-file isolation | Database integration test | Six tests passed for tenant context, cross-tenant rejection, immutable public case-file records, and controlled public-workspace provisioning. |
| Evidence storage provider selection | Focused API tests and no-object scheduler run | Google Cloud Storage and S3 selection passed unit tests. The scheduler completed with S3 configuration and no pending local job, so no storage object operation occurred. |

This validates the local review and persistence boundaries. It does not validate a browser sign-in, a raw evidence upload, an external storage object, a public HTTPS case file, a GenLayer transaction, or a deployed multi-instance rate limit.
