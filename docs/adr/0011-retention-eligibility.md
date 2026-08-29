# ADR 0011: Fail-closed evidence retention eligibility

## Status

Accepted for the retention policy core.

## Decision

Evidence is eligible for deletion only when all conditions are true:

- The related review case is completed.
- The evidence object has been verified.
- No legal hold is active.
- A retention deadline exists and has passed.

Pending, in-review, escalated, unverified, held, and undated evidence is never eligible.
Unknown legal hold states are rejected rather than interpreted.

This decision defines eligibility only. A future scheduled job must perform deletion through an
authorized storage adapter and append an audit event in the same controlled workflow.
