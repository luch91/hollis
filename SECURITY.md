# Security Policy

## Supported versions

Hollis is pre-release software. Only the latest commit on `main` is supported.

## Reporting a vulnerability

Do not open a public issue containing vulnerability details, credentials, customer information, or claim evidence. Use GitHub private vulnerability reporting after the repository is published. Until that channel is enabled, contact the repository owner through a private, verified channel.

## Security boundaries

- Hollis does not treat a public ledger as a storage system for sensitive evidence.
- Business endpoints must not ship before authentication and tenant authorization are implemented.
- An automated recommendation cannot independently trigger an adverse claim action.
- Audit events are append-only and corrections create new events.
- Secrets belong in an approved secret manager, never in repository files or application logs.

See [docs/non-negotiables.md](docs/non-negotiables.md) for the full product constraints and [docs/threat-model.md](docs/threat-model.md) for the initial threat model.
