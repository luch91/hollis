# ADR 0009: Signed claims webhooks

- Status: amended by [ADR 0014](0014-public-identity-platform-authentication.md)
- Date: 2026-08-29

> The HMAC, timestamp, and idempotency requirements remain the intended integration boundary. References below to a WorkOS organization identifier are historical. The endpoint is currently closed for public workspaces because secure workspace resolution for a claims sender has not been approved or implemented.

## Decision

Claims-system intake uses an HMAC-SHA256 signature over `timestamp.canonical-json-payload`.
Requests must include a Unix timestamp within five minutes, an `Idempotency-Key` equal to the
signed external claim reference, and the `X-Hollis-Signature` header in `sha256=<hex>` form.

The signed payload contains the WorkOS organization identifier. Hollis resolves that identifier to
the tenant after signature verification, then uses the existing tenant-scoped intake transaction.
The external reference remains the durable idempotency key. Reusing it with changed content is
rejected. Raw request content is never logged.

## Consequences

- Replayed stale requests are rejected before persistence.
- Matching retries return the existing review case without adding an event.
- Secret rotation, key identifiers, and multiple claims providers remain open decisions.
