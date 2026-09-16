<p align="center">
  <img src="apps/web/public/assets/hollis-mark.svg" alt="Hollis" width="64" height="64">
</p>

# Hollis

Hollis is a workspace for reviewing consequential automated decisions. Organizations bind a case to a published policy control, keep evidence private, require a human decision, preserve an append-only record, and receive a portable audit export.

GenLayer independently attests declared process facts after the human decision. It does not decide a case, expose private evidence, or establish legal correctness.

## What it does

- Creates tenant-scoped review cases bound to published policy controls.
- Stores evidence privately with integrity verification and short-lived access.
- Supports reviewer claim, escalation, rationale-backed decisions, and append-only history.
- Produces JSON, Markdown, DOCX, and PDF case records.
- Automatically submits completed, eligible reviews to a reusable GenLayer Studio Next policy-control contract and records a finalized receipt.
- Supports public registration, Google, GitHub, and verified email-and-password sign-in through Google Cloud Identity Platform.

Authentication proves identity. Hollis controls workspaces, membership, roles, and tenant access. A new identity never receives access to an existing workspace without an invitation or membership.

## Current evaluation deployment

The active evaluation release uses Vercel for the web application and API, Supabase PostgreSQL in Europe (Ireland), private Cloudflare R2 evidence storage, Google Cloud Identity Platform, Resend for product email, and GenLayer Studio Next. It is not a commercial-production certification.

See [release readiness](docs/release-readiness-2026-09-16.md) for the verified scope and remaining production controls.

## Architecture

```text
Decision-producing system or authorized user
                  |
                  v
              Hollis API
       /          |           \
Policies      Human review    Private evidence storage
       \          |           /
                  v
      Append-only audit and portable export
                  |
                  v
        Privacy-safe GenLayer case file
                  |
                  v
 Managed Studio Next policy-control contract
```

Hollis does not execute the upstream business decision. A human decision completes the Hollis workflow. A GenLayer result attests declared process facts only.

## Repository layout

```text
apps/api/             Fastify API and storage adapters
apps/web/             Next.js application
contracts/genlayer/   Privacy-safe process-attestation contracts
packages/contracts/   Shared validation and domain types
packages/database/    PostgreSQL schema, migrations, and access layer
docs/                 Architecture, runbooks, and historical records
```

## Local development

Requirements: Node.js 22.22+, pnpm 10.18+, Docker-compatible PostgreSQL, and an Identity Platform web configuration.

```sh
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

On PowerShell:

```powershell
Copy-Item .env.example .env
```

The API normally runs on `http://localhost:4000`; the web app normally runs on `http://localhost:3000`.

`.env` is ignored. Never commit credentials, private keys, connection strings, session tokens, or storage credentials. Use [.env.example](.env.example) for the configuration names, safe local defaults, and provider placeholders.

## Core workflow

1. An owner or administrator publishes a policy control with a private source document. Hollis calculates and verifies its SHA-256 digest.
2. An authorized member creates a case under that published control and adds private evidence.
3. A reviewer claims the case and records a rationale-backed decision, or escalates it.
4. Hollis retains the ordered audit history and produces a portable export.
5. For an eligible completed review, Hollis creates a privacy-safe public case file, submits it through its server-side execution account, verifies finality, and records the GenLayer receipt.

Customers do not operate Studio, fund a wallet, or enter a transaction hash during the standard workflow.

## Documentation

- [Architecture](docs/architecture.md)
- [Deployment contract](docs/deployment.md)
- [Public attestation case-file boundary](docs/public-attestation-case-files.md)
- [Managed GenLayer contract source and validation record](contracts/genlayer/README.md)
- [Identity Platform setup](docs/runbooks/identity-platform-setup.md)
- [Backup and recovery](docs/runbooks/backup-and-recovery.md)
- [Incident response](docs/runbooks/incident-response.md)
- [Contribution rules](CONTRIBUTING.md)
- [Non-negotiables](docs/non-negotiables.md)
- [Demo fixtures](docs/demo-fixtures.md)

Dated QA reports and earlier readiness snapshots are retained as historical evidence. They are not current deployment instructions.

## Verification

Before committing or pushing:

```sh
pnpm verify
pnpm audit --prod
```

The repository enforces the authorized Git identity. Use only `luch91 <luchijudith@gmail.com>` for commits.

## License

[MIT](LICENSE)
