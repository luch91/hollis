# ADR 0004: Authentication Gates Business Routes

- Status: Accepted, satisfied for review intake by ADR 0005 and ADR 0006
- Date: 2026-08-28

## Context

Review cases contain sensitive and tenant-specific information. Shipping temporary unauthenticated endpoints creates an unsafe compatibility burden.

## Decision

Expose liveness only during the foundation stage. Do not expose case intake, review, evidence, policy, or export endpoints until authentication, tenant authorization, session handling, and service identity have explicit accepted decisions and tests.

## Consequences

- The initial API is intentionally small.
- Each business route remains blocked until its own authentication, tenant, permission, and safety
  checks are implemented and tested.
- Review intake is the first business route to satisfy this gate.
