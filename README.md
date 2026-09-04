# Hollis

Hollis is decision-control infrastructure for consequential automated decisions. The first product workflow focuses on human review of adverse commercial property and casualty insurance claim recommendations.

The repository contains the product foundation: shared contracts, a PostgreSQL schema, an API
service, a web application, WorkOS AuthKit integration, repository policy enforcement, and
architecture documentation. The authenticated reviewer queue and human decision workflow are
implemented. Claims-system machine authentication and external action adapters remain closed.

## Repository structure

```text
apps/
  api/                 Fastify API
  web/                 Next.js web application
packages/
  contracts/           Runtime validation and shared types
  database/            PostgreSQL schema and database client
  typescript-config/   Shared compiler configuration
docs/
  adr/                 Architecture decision records
scripts/               Repository policy enforcement
```

## Requirements

- Node.js 22.22 or later
- pnpm 10.18 or later
- PostgreSQL 18 for local database work

## Local setup

```sh
pnpm install
docker compose up -d postgres
cp .env.example .env
pnpm db:migrate
pnpm dev
```

Replace the WorkOS placeholders in `.env` with credentials and URLs from the WorkOS dashboard. Add
`http://localhost:3000/callback` as a redirect URI, `http://localhost:3000/sign-in` as the sign-in
URL, and a local logout URI in that dashboard.

`DATABASE_MIGRATION_URL` belongs to the schema owner and is used only by migration commands.
`DATABASE_URL`, or the complete `DB_NAME`, `DB_USER`, `DB_PASS`, and `INSTANCE_UNIX_SOCKET` set,
belongs to the restricted application role. Production application roles must be configured with
`NOSUPERUSER` and `NOBYPASSRLS` so PostgreSQL row-level security remains effective.

The web application listens on `http://localhost:3000`. The API listens on
`http://localhost:4000`. `GET /health/live` is public. `GET /v1/session` requires a verified,
organization-scoped bearer access token.

`POST /v1/review-cases` requires the `reviews:create` permission. It creates a pending human review
and never executes the supplied recommendation. New cases require `reviewDueAt` and tenant scope
comes from the verified organization, not from request content.

Reviewers with `reviews:read` can list the queue with `GET /v1/review-cases`. A reviewer with
`reviews:assign` can claim a case for themselves. The assigned reviewer can escalate with
`reviews:escalate` or record a rationale-backed final recommendation with `reviews:decide`.
Reviewers with `reviews:read` can export a reproducible case package with
`GET /v1/review-cases/:caseId/export`. The export contains evidence references and ordered audit
events, never raw evidence content.
Evidence uploads use `POST /v1/review-cases/:caseId/evidence/uploads` with `reviews:create`; the
endpoint returns a short-lived signed upload URL. Downloads use
`GET /v1/review-cases/:caseId/evidence/:evidenceId/download` with `reviews:read`.

For GenLayer, Hollis can generate immutable public-safe adjudication case files only when
`PUBLIC_ATTESTATION_ORIGIN` is configured as a public HTTPS API origin. The public endpoint serves
only the versioned attestation schema. It does not expose evidence exports or review records. See
[public attestation case files](docs/public-attestation-case-files.md).

## Verification

```sh
pnpm verify
```

Database isolation tests run in CI. To run them against the local Compose database:

```sh
DATABASE_TEST_URL=postgres://hollis:hollis@localhost:5434/hollis pnpm --filter @hollis/database test:integration
```

This command checks repository policy, formatting, lint rules, types, tests, and production builds. Git hooks run policy checks before commits and the complete verification suite before pushes.

## Governance

Read [CONTRIBUTING.md](CONTRIBUTING.md) before making changes. Product invariants are defined in [docs/non-negotiables.md](docs/non-negotiables.md). Architecture decisions are recorded in [docs/adr](docs/adr).

## GenLayer attestation prototype

The privacy-safe case-file schema and GenLayer contract sources are in
[`contracts/genlayer`](contracts/genlayer). The current diagnostic contract is
`policy_process_attestation_v6.py`. It evaluates declared process facts from a public synthetic case
file and records results by case commitment, so each attestation remains independently queryable.
It does not adjudicate legal correctness, substantive fairness, or private evidence. Deployment
records and operator procedures are maintained beside the contract sources.

## License

Hollis is available under the [MIT License](LICENSE).
