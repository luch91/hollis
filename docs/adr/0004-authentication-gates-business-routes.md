# ADR 0004: Authentication Gates Business Routes

- Status: Accepted
- Date: 2026-08-28

## Context

Review cases contain sensitive and tenant-specific information. Shipping temporary unauthenticated endpoints creates an unsafe compatibility burden.

## Decision

Expose liveness only during the foundation stage. Do not expose case intake, review, evidence, policy, or export endpoints until authentication, tenant authorization, session handling, and service identity have explicit accepted decisions and tests.

## Consequences

- The initial API is intentionally small.
- Product endpoint work is blocked on an identity-provider decision.
- Demo behavior must use test fixtures or an isolated development harness rather than unsecured production-shaped routes.
