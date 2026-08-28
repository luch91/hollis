# ADR 0007: Review state transitions

- Status: accepted
- Date: 2026-08-28

## Context

Reviewers need a queue that makes ownership and escalation explicit. State changes must be safe
under concurrent requests and must not hide the recommendation or bypass human accountability.

## Decision

Use this state flow:

```text
pending -> in_review -> completed
                    \-> escalated -> in_review
```

Reviewers claim cases for themselves with `reviews:assign`. Only the assigned reviewer can escalate
or record a decision. Escalation requires a reason and preserves the prior assignment for audit
context. A reassignment is a new `review_started` event.

Decisions require `reviews:decide`, a final recommendation, and a non-empty rationale. The stored
decision includes the original recommendation, policy version, automated-system version, evidence
references, triggered rule, reviewer identity, outcome, timestamps, and final recommendation.

Each transition updates the case and appends its event in one transaction. A database-generated
event sequence orders the hash chain even when events share a timestamp. Invalid transitions are
rejected without changing the case.

## Consequences

- Queue access is tenant-scoped and excludes completed cases by default.
- A case cannot be decided while pending, escalated, or assigned to another reviewer.
- Escalation is visible and cannot be overwritten by a later decision event.
- The system still does not execute claim actions. An external action adapter requires a separate
  authorization and approval decision.
