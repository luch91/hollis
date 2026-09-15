# Evaluation Deployment Contract

This document describes the active Hollis evaluation deployment. It does not authorize commercial production, a cloud-account upgrade, or an infrastructure change.

## Active topology

| Layer | Service | Required boundary |
| --- | --- | --- |
| Web | Vercel | Serves the public sign-in, documentation, and protected workspace application. |
| API | Vercel, Dublin region | Serves authenticated API routes, liveness, and the public-safe case-file route. |
| Database | Supabase PostgreSQL, Europe (Ireland) | Separate administrative migration and restricted runtime connections. |
| Evidence | Private Cloudflare R2 bucket | Server-only S3-compatible credentials, tenant-scoped paths, and short-lived signed URLs. |
| Identity | Google Cloud Identity Platform | Browser identity only. Hollis controls tenant membership and authorization. |
| Email | Resend | Optional server-side welcome email through a verified sender. |
| Attestation | GenLayer Studio Next | Managed process attestation through the dedicated Hollis execution account. |

The active public API origin is the Vercel API project, not the web application origin. `NEXT_PUBLIC_API_URL` and `PUBLIC_ATTESTATION_ORIGIN` must use that verified HTTPS API origin. Do not use a local address, an ephemeral deployment URL, or the web-domain URL unless it routes the API endpoint.

## API package

The API is built from the repository root:

```sh
docker build -f apps/api/Dockerfile -t hollis-api:local .
```

The image runs as the non-root `node` user. The API uses `API_PORT` when set, otherwise a platform `PORT`, then `4000` locally.

## Runtime configuration

All secrets remain server-only and outside the repository. Use [.env.example](../.env.example) as the names-only configuration reference.

| Area | Required configuration or control |
| --- | --- |
| Database | Set `DATABASE_URL` for the restricted runtime connection and `DATABASE_MIGRATION_URL` for controlled schema changes. Both must target the same database. |
| Browser origin | Set `WEB_ORIGIN` to the verified HTTPS web origin. |
| Browser to API | Set `NEXT_PUBLIC_API_URL` to the verified HTTPS API origin. |
| Identity | Set `IDENTITY_PLATFORM_PROJECT_ID` in the API and the approved Identity Platform Web SDK values in the web project. |
| Sessions | Set `HOLLIS_SESSION_TTL_HOURS` from 1 through 24. |
| Evidence | Configure exactly one provider. The active evaluation provider is R2 and requires `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`; set `R2_JURISDICTION=eu` for the EU endpoint. |
| Public case file | Set `PUBLIC_ATTESTATION_ORIGIN` to the verified HTTPS API origin only. |
| Managed GenLayer | Set `GENLAYER_NETWORK=studio-next`, `GENLAYER_RPC_URL=https://studio-next.genlayer.com/api`, `GENLAYER_CHAIN_ID=61997`, `GENLAYER_RUNTIME_ADDRESS`, and `GENLAYER_RUNTIME_PRIVATE_KEY` together. The address must derive from the configured private key. |
| Email | Set `RESEND_API_KEY` and a verified `RESEND_FROM` together when welcome-email delivery is enabled. |

The runtime fails closed for invalid production-style configuration, incomplete evidence-provider configuration, mismatched managed GenLayer execution identity, and non-HTTPS deployment origins where HTTPS is required.

## Security controls

- Keep database connections, R2 credentials, runtime signing keys, and Resend keys server-only.
- Keep R2 private. Do not attach a public domain or expose storage credentials to the browser.
- Use separate database migration and restricted runtime roles. The runtime role must remain `NOSUPERUSER` and `NOBYPASSRLS`.
- Use tenant-scoped object paths and object-specific short-lived signed URLs.
- Allow unauthenticated access only to liveness and the deliberately enabled privacy-safe public case-file route.
- Keep the in-process fixed-window limiter as a single-instance backstop. Add a shared or edge limiter before a multi-instance commercial deployment.

## Managed GenLayer lifecycle

For an eligible completed review, Hollis generates a public-safe case file and submits it through the dedicated server-side execution account to the active reusable policy-control contract. Hollis stores the submission, reconciles finality, verifies contract views, and persists a receipt. A customer does not use a wallet, submit a Studio transaction, or enter a transaction hash.

The legacy importer remains available only for historical records. See [genlayer-studio-import.md](genlayer-studio-import.md).

## Release gate

Before a release commit or deployment change:

```sh
pnpm verify
pnpm audit --prod
```

For commercial production, complete every applicable item in [production preflight](runbooks/production-preflight.md). The current evaluation boundary and remaining work are in [release-readiness-2026-09-16.md](release-readiness-2026-09-16.md).

## Historical material

[cloud-run-preflight.md](cloud-run-preflight.md), the AWS evaluation notes, and dated readiness reports preserve prior decisions. They are not current deployment instructions.
