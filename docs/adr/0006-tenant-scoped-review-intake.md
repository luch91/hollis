# ADR 0006: Tenant-scoped review intake

- Status: amended by [ADR 0014](0014-public-identity-platform-authentication.md)
- Date: 2026-08-28

> The tenant-isolation, idempotency, append-only audit, and non-execution decisions remain active. References below to a WorkOS principal or `org_id` claim are historical. The active design derives the tenant from a verified Hollis session and workspace membership.

## Context

The first workflow needs a safe boundary for turning an automated claim recommendation into a
human review case. The boundary must prevent caller-selected tenancy, duplicate cases, audit gaps,
and accidental execution of an adverse recommendation.

## Decision

Expose `POST /v1/review-cases` only to an authenticated WorkOS principal with the
`reviews:create` permission. Resolve the Hollis tenant from the verified WorkOS `org_id` claim.
Reject tenant identifiers supplied in the request.

Use `externalReference` as an idempotency key within the resolved tenant. A replay with identical
validated content returns the existing case. Reusing the reference with different content returns a
conflict.

Create the pending review case and its `case_created` audit event in one PostgreSQL transaction.
The event records evidence references and a hash linked to the case, actor, tenant, content, and
occurrence time. PostgreSQL row-level security provides a second tenant-isolation boundary.

The endpoint records a recommendation for human review. It cannot deny, partially deny, accuse,
pay, close, or otherwise act on a claim.

## Consequences

- A WorkOS organization must map to a provisioned Hollis tenant before access is allowed.
- The runtime database role must not bypass row-level security or own the schema.
- Review-event update and delete privileges are unavailable to the runtime role.
- Claims-system machine authentication remains a separate open integration decision.
