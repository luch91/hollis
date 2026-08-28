# Product Non-Negotiables

These constraints define whether Hollis is safe and viable. A feature that violates one of them must not ship.

## Decision safety

1. An automated recommendation alone cannot issue a denial, partial denial, fraud accusation, cancellation, or other adverse consumer action.
2. Reviewers must see the recommendation, material evidence, applicable policy version, triggered rule, and known limitations before deciding.
3. The system must record reviewer identity, authority, outcome, rationale, and timestamps.
4. Reviewer queues must prioritize risk and deadline without concealing older cases.
5. Overrides must remain visible and measurable. They are not errors to suppress.

## Evidence integrity

1. Evidence must be content-addressed and traceable to its source.
2. Review history is append-only. Corrections are new events linked to the prior record.
3. Each event must be tenant-scoped and linked to its case.
4. Exported evidence packages must be reproducible and independently verifiable.
5. An attestation proves that a declared process produced a declared record. It does not prove that the substantive decision is legally correct.

## Privacy and security

1. Sensitive claim data stays off public ledgers.
2. Tenant identity comes only from a verified organization claim and never from request input.
3. Tenant isolation is enforced in application authorization and database policy.
4. Runtime database roles cannot own schemas and must use `NOSUPERUSER` and `NOBYPASSRLS`.
5. An authenticated account without an active organization cannot access a workspace.
6. Access uses least privilege and separation of duties.
7. Evidence is encrypted in transit and at rest.
8. Logs exclude secrets, raw evidence, access tokens, and unnecessary personal information.
9. Webhooks require signatures, bounded timestamps, replay protection, and idempotency keys.
10. Retention and deletion rules are explicit, testable, and configurable by contract and jurisdiction.
11. Security-sensitive operations produce structured audit events.

## Reliability

1. Claim-system events are idempotent.
2. Review deadlines use durable scheduling, not browser timers.
3. Failed integrations retry with bounded backoff and enter a visible dead-letter state.
4. External attestation failure cannot erase or corrupt the authoritative review record.
5. Recovery objectives, backup verification, and restoration exercises must exist before production use.

## Product claims

1. Hollis must not claim to guarantee compliance, fairness, or correctness.
2. Product language distinguishes recommendations, human decisions, process evidence, and external attestations.
3. Metrics must state their population, period, and calculation method.
4. Demonstrations and fixtures must not be presented as customer results.

## Delivery quality

1. Every release passes repository policy, formatting, lint, type, test, and build checks.
2. Database changes use reviewed migrations and documented rollback or forward-repair procedures.
3. Dependencies are pinned by the lockfile and reviewed for known vulnerabilities.
4. Production configuration fails closed when required security settings are absent.
