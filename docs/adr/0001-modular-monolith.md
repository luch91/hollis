# ADR 0001: Start with a Modular Monolith

- Status: Accepted
- Date: 2026-08-28

## Context

Hollis requires strong transaction boundaries across case creation, policy referral, review state, and audit events. The initial team and traffic profile do not justify distributed operational complexity.

## Decision

Use a TypeScript monorepo with separately deployable web and API applications, shared contracts, and one PostgreSQL database. Keep domain modules explicit inside the API. Do not split services until measured scaling, isolation, or ownership constraints require it.

## Consequences

- Transactions and authorization are easier to reason about.
- Local development and deployment remain manageable.
- Module boundaries must be enforced through imports and tests rather than network boundaries.
- A future service extraction requires an architecture decision record.
