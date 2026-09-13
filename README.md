<p align="center">
  <img src="apps/web/public/assets/hollis-mark.svg" alt="Hollis" width="64" height="64">
</p>

# Hollis

Hollis is decision-control infrastructure for consequential automated decisions. It gives an organization a structured place to collect evidence, apply a published policy control, require a human decision, preserve an append-only review record, and produce an auditable export.

The first workflow focuses on high-risk commercial insurance-claim recommendations. Hollis is designed as infrastructure, not an insurer, legal advisor, or automated decision maker. A review record does not execute an upstream recommendation and an attestation does not prove legal correctness, substantive fairness, or the truth of private evidence.

## What Hollis does

- Accepts risky automated decisions as tenant-scoped review cases.
- Binds each new case to a published, versioned policy control.
- Stores tenant-scoped evidence metadata and uses a selected object-storage provider for raw evidence.
- Requires an authorized human reviewer to claim, escalate, or record a rationale-backed decision.
- Writes ordered, append-only review events and exports a reproducible case record without raw evidence.
- Assigns every review case an immutable Hollis Case Reference in the form `HL-YY-XXXX-XXXX`; upstream source references remain separate idempotency keys.
- Publishes a separate, privacy-safe adjudication case file when independent GenLayer process attestation is enabled.
- Imports a finalized Studio Dev transaction in read-only mode after validating it against the stored case file.

Hollis supports Google Cloud Identity Platform for Google, GitHub, and verified email-and-password sign-in. Identity Platform proves a user identity. Hollis itself owns workspaces, invitations, memberships, roles, permissions, tenant isolation, and access decisions.

## Interface

The protected application uses Hollis's Petrol interface system. It includes a responsive workspace header, dark and light appearance modes, a real-data review horizon, a filterable review queue, a connected evidence and policy view, a separate GenLayer attestation panel, portable export previews, and tenant-scoped administration pages.

The Bound Record identity is supplied as deterministic vector artwork and is embedded in the product shell, application icon, and formatted document exports. Usage rules and approved asset locations are recorded in [docs/brand.md](docs/brand.md).

The interface does not maintain a second demonstration state. Navigation, filters, review actions, policy publishing, evidence controls, receipt links, exports, workspace switching, and administration remain connected to the existing Hollis server actions and API authorization boundaries. Local font files are distributed under their accompanying OFL license files in `apps/web/public/assets`.

## Product documentation

The web application publishes documentation at `/docs`. The primary guide at `/docs/how-hollis-works` follows the complete account-to-export workflow: identity verification, workspace setup, policy publication, case creation, evidence handling, human review, GenLayer Studio Dev attestation, and portable exports. Supporting guides cover each workflow independently, plus workspace administration and troubleshooting.

Privacy, security, evaluation terms, and support guidance are available before authentication and from the documentation navigation. The privacy and terms pages describe the current evaluation release only. They are not substitutes for final operator notices, a customer data-processing agreement, or commercial terms.

Documentation imagery uses controlled interface references and non-customer test data. Images must retain their original aspect ratio and must not contain credentials, session data, raw evidence, or personal information.

## Product boundaries

Hollis has explicit boundaries that must remain intact:

- A public registration or identity-provider account never grants access to an existing workspace.
- A new user must create a workspace or accept a tenant-scoped invitation.
- Tenant identity is derived from the verified Hollis session. It is never accepted from a request body, query parameter, or caller-controlled header.
- Raw evidence, policy documents, model output, prompts, secrets, and personal data must not appear in public GenLayer case files or public ledgers.
- A human decision completes the Hollis review. It does not execute an external business action.
- GenLayer Studio Dev is Hollis's designated attestation environment for the current release. It attests declared process facts only; it does not establish legal correctness, substantive fairness, or the truth of private evidence.

Read [docs/non-negotiables.md](docs/non-negotiables.md) before changing the product. The private decision log is intentionally Git-ignored and is not part of this repository.

## Repository structure

```text
apps/
  api/                 Fastify API and evidence-storage adapters
  web/                 Next.js protected workspace and public sign-in flow
contracts/
  genlayer/            Privacy-safe process-attestation contract sources
packages/
  contracts/           Runtime validation and shared types
  database/            PostgreSQL schema, migrations, and database client
  typescript-config/   Shared compiler configuration
docs/
  adr/                 Architecture decision records
  runbooks/            Provider and operational setup instructions
scripts/               Repository policy and environment preflight tooling
```

## Requirements

- Node.js 22.22 or later
- pnpm 10.18 or later
- Docker Desktop or another Docker-compatible runtime for local PostgreSQL
- PostgreSQL 18 when running the supplied Compose environment
- A Google Cloud Identity Platform web configuration for interactive sign-in

## Local setup

Install dependencies, create a local environment file, start PostgreSQL, apply migrations, and run both applications:

```sh
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

On PowerShell, copy the environment file with:

```powershell
Copy-Item .env.example .env
```

The API normally listens on `http://localhost:4000`. The web application normally listens on `http://localhost:3000`. If that web port is occupied, Next.js selects another port and prints the exact URL.

`GET /health/live` is public and returns the API liveness response. The protected workspace is at `/app`; a user without a Hollis session is redirected to `/sign-in`.

### Local environment variables

`.env` is Git-ignored. Use `.env.example` as the names-only template. Do not commit passwords, session tokens, OAuth client secrets, service-account keys, or storage credentials.

| Variable | Local purpose | Notes |
| --- | --- | --- |
| `NODE_ENV` | Runtime mode | Use `development` locally. |
| `API_HOST`, `API_PORT` | API bind address and port | The provided local values are `127.0.0.1` and `4000`. |
| `WEB_ORIGIN` | Allowed browser origin for API CORS | Normally `http://localhost:3000`. |
| `NEXT_PUBLIC_API_URL` | API URL used by the web application | Normally `http://localhost:4000`. |
| `DATABASE_URL` | Restricted runtime database connection | Use this locally, or use all four structured database settings below. |
| `DB_NAME`, `DB_USER`, `DB_PASS`, `INSTANCE_UNIX_SOCKET` | Structured runtime database connection | Set all four only as an alternative to `DATABASE_URL`. Never set both connection forms. |
| `DATABASE_MIGRATION_URL` | Migration-owner database connection | Use only for schema migration commands. |
| `DATABASE_TEST_URL` | Isolated local integration-test connection | Points to the local Compose database by default. |
| `NEXT_PUBLIC_IDENTITY_PLATFORM_API_KEY` | Identity Platform web configuration | This is browser-visible configuration, not an authorization credential. |
| `NEXT_PUBLIC_IDENTITY_PLATFORM_AUTH_DOMAIN` | Identity Platform web configuration | Obtain from the Identity Platform Web SDK configuration. |
| `NEXT_PUBLIC_IDENTITY_PLATFORM_PROJECT_ID` | Identity Platform web configuration | Obtain from the Identity Platform Web SDK configuration. |
| `IDENTITY_PLATFORM_PROJECT_ID` | API-side Identity Platform token verification | Must identify the same approved project as the web configuration. |
| `HOLLIS_SESSION_TTL_HOURS` | Hollis session lifetime | Integer from 1 through 24. Default is 8. |
| `RESEND_API_KEY` | Server-only Resend API key | Leave unset to disable welcome-email delivery. Never expose it to the browser or commit it. |
| `RESEND_FROM` | Verified Resend sender | Required with `RESEND_API_KEY`. Use `Hollis <hello@mail.thehollis.xyz>` for the approved sending subdomain. |
| `GCS_BUCKET`, `GCS_PROJECT_ID` | Google Cloud Storage evidence provider | Configure this provider or the S3 provider, never both. |
| `GCS_SIGNER_SERVICE_ACCOUNT` | Optional Google Cloud signer principal | Overrides the default runtime signer used for short-lived evidence URLs. It is an identity, not a credential. |
| `S3_BUCKET`, `AWS_REGION` | S3 evidence provider | `AWS_REGION` is required when `S3_BUCKET` is set. |
| `CLAIMS_WEBHOOK_SECRET` | Claims-system webhook verification | At least 32 characters. Required in production. |
| `PUBLIC_ATTESTATION_ORIGIN` | Public HTTPS API origin for privacy-safe case files | Leave unset until the API public endpoint is deliberately deployed and verified. |
| `GENLAYER_STUDIO_CONTRACT_ADDRESS` | Read-only Studio Dev attestation importer | Set only to a contract that has passed the recorded policy-binding and representative-state checks. |
| `RETENTION_TENANT_IDS` | Explicit tenant list for the one-shot retention scheduler | This does not run as part of `pnpm dev`. |

The runtime validates configuration at startup. In production it rejects missing evidence storage, claims-webhook secret, HTTPS `WEB_ORIGIN`, or the required API host binding. It also rejects configuring Google Cloud Storage and S3 together.

### Configure public sign-in

Follow [the Identity Platform setup runbook](docs/runbooks/identity-platform-setup.md). In summary:

1. Enable verified email-and-password sign-in in Google Cloud Identity Platform.
2. Configure Google sign-in with the approved domains.
3. Configure GitHub through an OAuth application whose callback URL is the one Identity Platform displays.
4. Copy only the Web SDK configuration values into local `.env` and approved deployment environment settings.
5. Do not put a GitHub OAuth client secret, a Google OAuth secret, a service-account key, or any user token in the repository or browser configuration.

After sign-in, a user without a Hollis membership reaches workspace onboarding. They can create a workspace or accept a valid invitation. Authentication alone does not disclose or grant access to another organization's cases.

Identity Platform sends the email-verification message for email-and-password registration. When Resend is configured, Hollis records one welcome-email delivery for each newly created verified account and sends it from the API only. Delivery failure is recorded without blocking session creation. Existing accounts are not backfilled with welcome messages.

Follow [the transactional-email runbook](docs/runbooks/transactional-email.md) to configure the approved Resend sender and perform the controlled welcome-email acceptance check.

Hollis sessions are opaque server-side records. The API returns their expiry at session establishment and the browser derives the `HttpOnly` cookie lifetime from that value. Sign-out requires successful server revocation before clearing a usable local cookie. A confirmed invalid or expired token can be cleared; a network or server failure leaves the cookie in place and reports that sign-out could not be completed.

## Core workflow

1. An authorized workspace member creates a review case and selects a published policy control.
2. Hollis records the case with a review deadline and an append-only event.
3. An authorized user uploads evidence. The API stores metadata and provides a short-lived object-specific upload URL. Raw bytes stay in the configured object-storage provider.
4. An authorized reviewer claims the pending case, examines its evidence and policy context, then records a rationale-backed decision or escalates it.
5. Hollis preserves the ordered review history and can generate a tenant-scoped export containing evidence references and the event record, not raw evidence contents. Downloaded records use the Hollis Case Reference in their filename.
6. When the independent-attestation gate is enabled, an authorized reviewer can generate an immutable, public-safe case file from bounded process facts. An authorized operator submits that generated URL and commitment to GenLayer Studio Dev. Hollis then validates and imports only the finalized result.

The active permission model includes reading, creating, assigning, escalating, deciding, retaining, and attesting. Workspace administration controls invitations, memberships, and roles. Do not broaden a role or bypass the API authorization checks to unblock a workflow.

## Evidence and retention

Evidence objects are tenant-scoped, content-addressed, and accessed through short-lived signed URLs. Hollis stores metadata and integrity information in PostgreSQL. It does not make raw evidence public or include it in exports by default.

The product default is to retain pending cases until resolved and completed cases for seven years after the final decision, subject to approved policy and jurisdiction changes. Legal holds prevent deletion until explicitly released. Retention deletion is a separate, audited job and must not run for cases under appeal, investigation, or legal hold.

The retention scheduler selects the same validated storage provider as the API. Its provider selection is covered by focused tests and a local no-object S3 scheduler run. Deletion against a real S3 bucket remains a production-provider acceptance test. See [production-readiness-2026-09-10.md](docs/production-readiness-2026-09-10.md).

## GenLayer attestation

Hollis uses GenLayer for an independent attestation of declared process facts, not a judgment of private evidence or legal compliance.

The public case-file boundary is documented in [public-attestation-case-files.md](docs/public-attestation-case-files.md). The contract sources are in [`contracts/genlayer`](contracts/genlayer). The validated Studio Dev V7 contract exposes its immutable policy binding and records results by case commitment so separate case results remain queryable.

The Studio importer is deliberately read-only. It does not submit transactions and it must not hold a wallet signing key. Use [genlayer-studio-import.md](docs/genlayer-studio-import.md) and the recorded contract procedures before enabling it.

## API outline

The API is implemented in `apps/api`. The public routes are limited to liveness, the browser-session exchange, and public-safe attestation case files when enabled. A signed claims-webhook route exists as a closed future-integration boundary and does not create public-workspace cases.

Authenticated routes cover:

- current user and active-workspace management
- workspace creation, switching, and invitation acceptance
- workspace profile, membership, role, and invitation administration
- policy-control library management
- review-case intake, queue, claim, escalation, decision, export, and audit history
- evidence upload preparation, verification, and signed download
- public-safe attestation-file generation and finalized transaction import

Every business route must establish the verified Hollis session, resolve a workspace membership, check the required permission, and apply tenant scope before reading or writing business data.

## Verification

Run the repository gate before committing or pushing:

```sh
pnpm verify
pnpm audit --prod
```

`pnpm verify` runs repository policy, formatting, linting, TypeScript checks, tests, and production builds. The current stylesheet produces known lint warnings, including required reduced-motion overrides; lint exits successfully.

The API includes an in-process fixed-window backstop for session exchange, onboarding, invitations, evidence operations, exports, claims-webhook traffic, and attestation operations. A production deployment must add an edge or shared-store rate-limit control so limits remain effective across runtime instances.

Run database integration tests against the local Compose database:

```sh
DATABASE_TEST_URL=postgres://hollis:hollis@localhost:5434/hollis pnpm --filter @hollis/database test:integration
DATABASE_TEST_URL=postgres://hollis:hollis@localhost:5434/hollis DATABASE_URL=postgres://hollis_app:hollis_app@localhost:5434/hollis pnpm --filter @hollis/api test:integration
```

The baseline local verification record is [docs/local-verification-2026-09-10.md](docs/local-verification-2026-09-10.md). The latest interactive browser findings are in [docs/qa-report-2026-09-12.md](docs/qa-report-2026-09-12.md), and the current release boundary is in [docs/release-readiness-2026-09-12.md](docs/release-readiness-2026-09-12.md).

## Production status

Hollis is not production-ready solely because this repository builds and passes local tests. The current blockers and required exit criteria are recorded in [production-readiness-2026-09-10.md](docs/production-readiness-2026-09-10.md) and the dated [release-readiness snapshot](docs/release-readiness-2026-09-12.md). They include correcting the confirmed local workflow inconsistencies, establishing the approved runnable API target, completing real-provider acceptance tests, adding deployment-wide rate limits, exercising backup restoration, and completing incident-response and independent-security reviews.

Operational procedures and the approval checklist are in [docs/runbooks](docs/runbooks), including [backup and recovery](docs/runbooks/backup-and-recovery.md), [incident response](docs/runbooks/incident-response.md), and [production preflight](docs/runbooks/production-preflight.md).

Do not deploy using the legacy Cloud Run and WorkOS references in older documents. They are historical material and not a current deployment runbook. No cloud provider, billing plan, or account setting is changed by local development commands in this repository.

## Governance and contribution rules

- Read [CONTRIBUTING.md](CONTRIBUTING.md), [docs/non-negotiables.md](docs/non-negotiables.md), and the relevant ADR before making a change.
- Repository policy enforces the authorized Git identity and commit-message rules. The repository account is `luch91` with `luchijudith@gmail.com`.
- Do not add automated authorship credit, secrets, raw evidence, or private decision-log content to Git.
- Use focused conventional commits. Do not use em dash characters in source, documentation, or commit messages.

## License

Hollis is available under the [MIT License](LICENSE).
