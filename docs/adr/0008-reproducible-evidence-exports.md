# ADR 0008: Reproducible evidence exports

- Status: accepted
- Date: 2026-08-29

## Context

Customers need an independently checkable record of what Hollis reviewed without exposing raw
claim content on a public network. Evidence references and append-only events already carry the
source digest and process history.

## Decision

Expose an authenticated, tenant-scoped export for a review case. The package contains the case
metadata needed to identify the recommendation, policy, rule, risk, deadline, and evidence
references, plus all audit events in database event-sequence order. A schema version and manifest
hash make the package reproducible and detect changes to its contents.

The export contains references and event payloads only. Raw evidence remains in the customer's
controlled storage and no export is published to a public ledger. Object storage and retention
remain separate open decisions.

## Consequences

- A reviewer can verify the event ordering and manifest without database access.
- The database remains the authoritative record.
- Export access inherits the existing `reviews:read` permission and tenant boundary.
- Future attestation adapters can consume the manifest without receiving sensitive content.
