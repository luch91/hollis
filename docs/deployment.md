# Deployment Requirements

This document defines the deployment contract for Hollis. It is not a provider-specific production runbook and does not authorize a deployment. The Cloud Run instructions that previously occupied this document were tied to retired WorkOS authentication assumptions and are not current.

The current production target is intentionally undecided while AWS account access and quota review are pending. Do not create, upgrade, or deploy cloud resources from this document.

## API container

Build the API image from the repository root:

```sh
docker build -f apps/api/Dockerfile -t hollis-api:local .
```

The image runs as the non-root `node` user and contains no credentials. The API binds to `0.0.0.0` in a deployed environment. It uses `API_PORT` when supplied, otherwise the platform-provided `PORT`, then `4000` for local development.

## AWS evaluation-runtime readiness

This section records the approved preparation boundary for the AWS Free-plan evaluation runtime. It does not authorize a launch or deployment.

Before resuming the EC2 launch workflow, verify all of the following in the AWS Console:

1. AWS Support has approved the pending `eu-west-1` Standard-instance vCPU quota increase and the applied quota is at least two vCPUs. Do not retry the launch before that verification.
2. The account remains on its approved Free plan. Stop if any page presents an upgrade, paid-only feature, Organization, Control Tower, or IAM Identity Center flow.
3. The selected region is Europe (Ireland), `eu-west-1`.
4. The instance remains the approved Free-plan-eligible `t3.micro` with a current Amazon Linux 2023 x86_64 AMI.
5. The instance has no SSH key pair, uses IMDSv2, uses standard CPU credits, has detailed monitoring disabled, and does not use Spot capacity.
6. The root EBS volume is encrypted, deletes on termination, and has no additional volumes or file systems.
7. The instance uses only the approved `hollis-evaluation-runtime` instance profile.
8. The selected API security group has zero inbound rules and only the approved outbound HTTPS rule. Do not add an inbound rule until a reviewed TLS ingress design is ready.

After the instance is running, deployment work remains blocked until there is an approved TLS ingress design, a verified public API origin, database connectivity through the separate runtime identity, and an approved secrets-delivery mechanism. Only then may `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL`, `PUBLIC_ATTESTATION_ORIGIN`, and the public deployment configuration be set for the matching HTTPS origins.

Vercel remains the web-console host. Do not deploy or alter its project configuration until the API's verified HTTPS origin is available and the approved Vercel project identity can be inspected.

## Required runtime configuration

The selected runtime must supply configuration through its approved secret and environment mechanism. Do not place connection strings, OAuth client secrets, service-account keys, session tokens, or signing keys in the image, repository, browser configuration, or public environment variables.

| Requirement | Runtime setting or control |
| --- | --- |
| Database connection | Set `DATABASE_URL`, or all of `DB_NAME`, `DB_USER`, `DB_PASS`, and `INSTANCE_UNIX_SOCKET`. Never set both forms. |
| Database least privilege | Use a separate migration role and runtime role. Runtime remains `NOSUPERUSER` and `NOBYPASSRLS`. |
| Browser origin | Set `WEB_ORIGIN` to the verified HTTPS console origin. |
| User authentication | Set `IDENTITY_PLATFORM_PROJECT_ID`; the web application also needs the three Identity Platform Web SDK configuration values. |
| Hollis sessions | Set `HOLLIS_SESSION_TTL_HOURS` from 1 through 24. |
| Evidence storage | Configure exactly one provider: `GCS_BUCKET` with `GCS_PROJECT_ID`, or `S3_BUCKET` with `AWS_REGION`. |
| Claims webhook | Set a `CLAIMS_WEBHOOK_SECRET` of at least 32 characters only when the closed claims integration is deliberately enabled. |
| Public attestation files | Set `PUBLIC_ATTESTATION_ORIGIN` only to the verified HTTPS API origin that serves the limited public case-file route. |
| Studio Dev importer | Set `GENLAYER_STUDIO_CONTRACT_ADDRESS` only for the documented read-only attestation-import flow. |
| Managed Studio Dev runtime | Configure `GENLAYER_NETWORK`, `GENLAYER_RPC_URL`, `GENLAYER_CHAIN_ID`, `GENLAYER_RUNTIME_ADDRESS`, and `GENLAYER_RUNTIME_PRIVATE_KEY` together. The private key is a server-only secret and the address must be derived from that key. |

Production configuration fails closed when the claims secret, evidence provider, HTTPS `WEB_ORIGIN`, or API host binding are absent or invalid. It rejects simultaneous Google Cloud Storage and S3 configuration.

## Network and access controls

- Terminate TLS before user traffic reaches the API.
- Keep the database and raw evidence storage private. Do not expose them to the public internet.
- Use a dedicated runtime identity with only the database, storage, and secret permissions it requires.
- Keep the migration identity separate from the runtime identity and use it only for controlled schema changes.
- Restrict object storage to tenant-scoped object paths and short-lived signed object URLs.
- Keep the API's in-process fixed-window limiter as a local backstop. Add an approved edge or shared-store limiter before a multi-instance production deployment.
- Permit unauthenticated access only to liveness and the privacy-safe attestation-case-file route when that route is explicitly enabled.
- Do not expose review, evidence, export, retention, workspace-administration, or session-management routes as public resources.

## Retention execution

Retention deletion is a separate authenticated scheduled task. It requires an explicit `RETENTION_TENANT_IDS` list and must record its completed or failed outcomes in the audit trail.

The scheduler selects the configured Google Cloud Storage or S3 provider through the same validated configuration boundary as the API. Its S3 deletion workflow remains a required real-provider acceptance test. Do not schedule a production retention job until that test, its failure handling, and its audit record have been verified.

## Required release gate

Before any deliberate deployment, run:

```sh
pnpm verify
pnpm audit --prod
```

Then run the provider-specific preflight only after the target, region, and approved resources are recorded. The preflight must be read-only and must verify without reading secret values:

1. the expected project or account, region, and runtime identity;
2. database reachability and migration/runtime role separation;
3. private evidence-storage configuration and least-privilege access;
4. required secrets and non-secret environment configuration;
5. HTTPS console and public case-file endpoint behavior;
6. scheduled retention authentication and provider compatibility;
7. logging, alerting, backup, restore, and incident-response readiness.

## Deployment blockers

The current blockers and verification record are authoritative:

- [production-readiness-2026-09-10.md](production-readiness-2026-09-10.md)
- [local-verification-2026-09-10.md](local-verification-2026-09-10.md)
- [Identity Platform setup](runbooks/identity-platform-setup.md)

Do not treat a successful local build, a running local Docker database, a Studio Dev result, or an AWS account sign-in as production authorization.
