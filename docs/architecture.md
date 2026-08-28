# Architecture

## Objective

Hollis controls the transition from an automated recommendation to a consequential claim action. It records why a case was referred, what evidence was considered, which policy and system versions applied, who reviewed the case, and what outcome was authorized.

## System context

```text
Claims system
    |
    | authenticated event
    v
Hollis API
    |
    +--> policy and intervention rules
    +--> review workflow
    +--> append-only evidence history
    |
    v
PostgreSQL
    |
    +--> evidence object references
    +--> optional attestation adapter
```

Hollis does not replace the customer's claims system. It acts as a control plane and evidence system around high-risk decisions.

## Deployment shape

The initial deployment is a modular monolith:

- `apps/web` provides the reviewer interface.
- `apps/api` owns application use cases and external boundaries.
- `packages/contracts` defines validated inputs and shared domain values.
- `packages/database` owns persistence schema and database access.
- PostgreSQL is the source of truth for transactional state and review history.
- An object store will hold encrypted evidence after a provider is selected.
- An attestation adapter may publish minimal hashes after the core review is complete.

This shape keeps transactions, authorization, and operational reasoning in one deployable boundary while maintaining module separation in code.

## Domain modules

### Intake

Creates an idempotent, pending human review from a validated recommendation. The current route uses
an authenticated WorkOS principal with `reviews:create`. Machine authentication for a direct claims
platform integration remains undecided.

### Policy

Evaluates explicit intervention rules and records the exact rule and version that caused referral.

### Review

Assigns cases, enforces separation of duties, and records approve, modify, reject, or escalate outcomes.

### Evidence

Stores content-addressed references, provenance, media type, integrity digest, and access metadata. Sensitive content remains outside public ledgers.

### Audit

Writes append-only events linked by hashes. Corrections create new events and never rewrite history.

### Attestation

Publishes privacy-safe proofs after review finality. This module is isolated from the core transaction and can be disabled.

## Trust boundaries

Every integration, browser session, background process, database connection, object-store request, and attestation call is a separate trust boundary. Tenant identity and authorization must be established at each applicable boundary.

## Identity and tenant boundary

WorkOS AuthKit owns the browser authentication session. The API accepts bearer access tokens only
after verifying their signature, issuer, client ID, expiry, and organization context. The verified `org_id`
claim maps to one tenant and cannot be overridden by request input. Route-level permissions are
checked after authentication and before domain logic.

PostgreSQL row-level security filters tenant, membership, user, case, and event access using
transaction-local context. The runtime role cannot bypass row security, mutate review events, or
delete review cases.

## Deferred choices

Hosting, object storage, initial claims integration, retention schedules, and attestation activation
remain open. Review intake is open behind its verified security boundary. Other business routes
stay closed until their authentication, tenant, authorization, and workflow checks are implemented
and tested.
