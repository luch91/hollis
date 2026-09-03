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
    +--> attestation adapter
              |
              +--> GenLayer Intelligent Contract (optional, post-review)
              +--> downstream audit and reporting systems
```

Hollis does not replace the customer's claims system. It acts as a control plane and evidence system around high-risk decisions.

## Deployment shape

The initial deployment is a modular monolith:

- `apps/web` provides the reviewer interface.
- `apps/api` owns application use cases and external boundaries.
- `packages/contracts` defines validated inputs and shared domain values.
- `packages/database` owns persistence schema and database access.
- PostgreSQL is the source of truth for transactional state and review history.
- Google Cloud Storage will hold encrypted evidence in project `hollis-507001` after a bucket location is selected. PostgreSQL stores only tenant-scoped evidence object metadata.
- An attestation adapter may publish minimal hashes after the core review is complete.

This shape keeps transactions, authorization, and operational reasoning in one deployable boundary while maintaining module separation in code.

## Domain modules

### Intake

Creates an idempotent, pending human review from a validated recommendation. The current route uses
an authenticated WorkOS principal with `reviews:create`. Machine authentication for a direct claims
platform integration uses a signed canonical payload, a bounded timestamp window, and an
idempotency key equal to the external claim reference.

### Policy

Evaluates explicit intervention rules and records the exact rule and version that caused referral.

### Review

Lists tenant-scoped cases by risk and deadline, lets a reviewer claim a case, records explicit
escalation, and requires an assigned reviewer to submit a rationale-backed human decision. State
changes and audit events commit together.

### Evidence

Stores content-addressed references, provenance, media type, integrity digest, and access metadata. The storage adapter uses tenant-scoped Google Cloud Storage objects and short-lived signed URLs. Sensitive content remains outside public ledgers. Authenticated reviewers can export a reproducible package containing the case references and ordered append-only events with a manifest hash.

### Audit

Writes append-only events linked by hashes. Corrections create new events and never rewrite history.

### Attestation

Publishes privacy-safe process attestations after review finality. The module is isolated from the
core transaction and can be disabled. It has three explicit boundaries:

1. The interop adapter converts a finalized Hollis case manifest into a provider-neutral attestation
   request. It sends hashes, policy identifiers, decision metadata, and the minimum case facts needed
   for adjudication. It never sends raw evidence, secrets, or personal claim data.
2. The GenLayer adapter submits the normalized request to a GenLayer Intelligent Contract and maps
   the resulting validator-consensus state, appeal state, and final verdict into Hollis values.
3. The attestation record writer appends the result to PostgreSQL as an `attestation_recorded` event
   and exposes it through authenticated case detail and export responses.

The PostgreSQL review record remains authoritative. A failed, pending, appealed, or undetermined
attestation cannot change the human decision or block the core review transaction.

The pre-activation implementation uses `hollis.policy.v1` and
`hollis.adjudication-case.v1` schemas. The GenLayer contract verifies deterministic process
preconditions against a public, privacy-reviewed case file. Controls that require interpretation
resolve to `needs_review` until a separately approved semantic-adjudication design exists.

### Attestation sequence

```text
Finalized Hollis case
    |
    v
Privacy review and manifest digest
    |
    v
Provider-neutral interop request
    |
    v
GenLayer Intelligent Contract
    |
    +--> validator consensus
    +--> appeal window
    +--> final verdict
    |
    v
Attestation adapter
    |
    v
Append-only Hollis attestation event and export reference
```

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
remain open. The GenLayer contract, interop adapter, and attestation result path are planned behind
the accepted external-attestation boundary and a separate threat review. Review intake and the reviewer workflow are open behind their verified security
boundaries. Claims-system machine authentication and external action adapters stay closed until
their authentication, tenant, authorization, and workflow checks are implemented and tested.
