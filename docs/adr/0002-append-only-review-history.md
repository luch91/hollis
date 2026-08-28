# ADR 0002: Append-Only Review History

- Status: Accepted
- Date: 2026-08-28

## Context

Hollis must explain who did what, when, under which policy, using which evidence. Mutable history would weaken investigations, audits, appeals, and attestations.

## Decision

Represent review history as ordered, append-only events. Each event contains a digest of its canonical content and the prior event digest. Corrections and reversals create new events. Read models may be updated for performance, but events remain authoritative for history.

## Consequences

- Evidence exports can be independently checked for missing or changed events.
- Application and database permissions must prevent event updates and deletion.
- Canonical serialization and concurrent append behavior require dedicated tests.
- Privacy deletion may require cryptographic erasure or separation of personal content from durable event metadata.
