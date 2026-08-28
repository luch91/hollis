# ADR 0003: Isolate External Attestation

- Status: Accepted
- Date: 2026-08-28

## Context

External attestation can provide independently verifiable process evidence, but public systems create privacy, latency, cost, and availability concerns.

## Decision

Keep attestation behind an adapter that receives a finalized, privacy-reviewed evidence digest. The PostgreSQL review record remains authoritative. Attestation happens after the core review transaction and cannot block or change its outcome.

## Consequences

- Hollis remains useful without a specific network.
- Sensitive evidence and personal identifiers stay off-chain.
- Failed publication can retry independently.
- Any future GenLayer integration requires a separate threat review and activation decision.
