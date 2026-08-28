# Hollis

Hollis is decision-control infrastructure for consequential automated decisions. The first product workflow focuses on human review of adverse commercial property and casualty insurance claim recommendations.

The repository currently contains the product foundation: shared contracts, a PostgreSQL schema, an API service, a web application, repository policy enforcement, and architecture documentation. Business endpoints remain closed until authentication and tenant authorization are explicitly selected and implemented.

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
pnpm dev
```

The web application listens on `http://localhost:3000`. The API listens on `http://localhost:4000` and exposes `GET /health/live`.

## Verification

```sh
pnpm verify
```

This command checks repository policy, formatting, lint rules, types, tests, and production builds. Git hooks run policy checks before commits and the complete verification suite before pushes.

## Governance

Read [CONTRIBUTING.md](CONTRIBUTING.md) before making changes. Product invariants are defined in [docs/non-negotiables.md](docs/non-negotiables.md). Architecture decisions are recorded in [docs/adr](docs/adr).

## License

Hollis is available under the [MIT License](LICENSE).
