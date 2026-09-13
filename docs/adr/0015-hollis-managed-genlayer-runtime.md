# ADR 0015: Hollis-managed GenLayer runtime

- Status: Accepted
- Date: 2026-09-13

## Context

The validated Studio Dev workflow still requires an operator to deploy a policy-bound contract,
submit each completed case, and import the finalized result. That proves the protocol path, but it
is not an acceptable customer workflow. Customer organizations must not hold a Hollis execution
key or operate Studio manually.

The V7 contract binds eight immutable policy and control values at construction. A deployment can
therefore be reused for every case with the same exact policy version and control. A different
binding or a reviewed contract-source revision requires a different deployment.

## Decision

Hollis will operate one dedicated Studio Dev execution account from the API runtime. The private
key is a server-only secret. It must never be committed, sent to the browser, stored in Vercel
client configuration, or entered by a customer.

Hollis records each deployment in a tenant-isolated policy-contract registry. The idempotency key
is the tenant, canonical policy-binding digest, Studio Dev chain ID, and exact contract-source
digest. A registry entry records the runtime address, deployment transaction, resulting contract
address, verification state, and activation state.

Deployment follows these transitions:

```text
pending -> submitting -> submitted -> finalized -> verified -> active
```

Before activation, Hollis reads `get_policy_binding` from finalized state and compares all eight
values with the requested binding. Failed execution and binding mismatch are terminal. If the
process loses the deployment response after attempting submission, it leaves a durable uncertain
state for operator reconciliation and does not submit again automatically.

Only one active deployment may exist for a tenant policy-control record. Activating a verified
replacement supersedes the former deployment transactionally. Cases use the active contract for
their exact published policy binding. A contract is not deployed per case.

Per-case adjudication uses a separate tenant-isolated submission registry. Hollis reserves the
case idempotency key before broadcasting, records the transaction hash immediately, waits for
successful finalization, then reads and stores the three retained V7 result views. A retry resumes
from the recorded transaction hash. A lost broadcast response enters `reconciliation_required`
and cannot be automatically resubmitted.

## Consequences

- Customers interact with Hollis, not a GenLayer wallet or Studio deployment form.
- A policy control can serve many case adjudications without weakening its immutable binding.
- Contract-source upgrades remain explicit and auditable.
- A deployment timeout cannot silently trigger an automatic duplicate deployment.
- Key rotation, balance monitoring, transaction reconciliation, worker scheduling, and production
  runtime activation still require operational runbooks.
