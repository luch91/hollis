# Architecture

## Objective

Hollis is a control plane for consequential automated decisions. It records the decision under review, applicable published policy control, evidence references, human review, and exportable audit history. It does not execute an upstream business action.

The initial use case is human review of high-risk commercial insurance-claim recommendations. The tenancy and control model is intended to support other consequential decision workflows only after their policy, evidence, and authorization requirements are explicitly designed.

## System context

```text
Decision-producing system
    |
    | approved authenticated integration, not yet enabled for public workspaces
    v
Hollis API
    |
    +--> policy-control library
    +--> workspace and role controls
    +--> human review workflow
    +--> evidence metadata and signed object access
    +--> append-only audit history and export
    |
    +--> optional public-safe attestation publisher
             |
             v
          GenLayer Studio Next, managed result recording
    |
    v
PostgreSQL and configured object storage
```

Hollis does not replace a customer's decision-producing system. It preserves an independently reviewable process record around a high-risk decision.

## Deployment shape

Hollis is a modular monolith:

- `apps/web` is the Next.js public sign-in and protected-workspace application.
- `apps/api` owns browser-session exchange, authorization, domain use cases, and external boundaries.
- `packages/contracts` defines shared runtime schemas and domain values.
- `packages/database` owns the PostgreSQL schema, migrations, and database access.
- PostgreSQL is the source of truth for transactional state and ordered review history.
- The evidence adapter selects exactly one configured provider: Google Cloud Storage, Amazon S3, Azure Blob Storage, or Cloudflare R2. PostgreSQL retains tenant-scoped metadata, not raw evidence bytes.
- GenLayer attestation is isolated from the core human-review transaction. The managed runtime uses a dedicated server-side execution identity and tenant-scoped policy-contract registry without changing review finality.

The current evaluation deployment uses Vercel for the web application and API, Supabase PostgreSQL in Europe (Ireland), private Cloudflare R2 evidence storage, Google Cloud Identity Platform, and GenLayer Studio Next. It is an evaluation release, not a commercial-production authorization. Historical Cloud Run and AWS material remains only as archived context. See [release-readiness-2026-09-16.md](release-readiness-2026-09-16.md).

## Identity, workspace, and tenant boundary

Google Cloud Identity Platform authenticates users through Google, GitHub, or verified email-and-password sign-in. The web application sends a verified Identity Platform ID token to `POST /v1/auth/sessions`. The API verifies the token issuer, audience, expiry, subject, verified email, and optional profile claims before establishing an opaque Hollis session.

The API supplies the exact Hollis-session expiry in the session-establishment response. The web application derives the `HttpOnly` cookie lifetime from that expiry rather than keeping a separate fixed duration. Sign-out clears the browser cookie only after server revocation succeeds or the API confirms that the token is already invalid. A transport or server failure retains the cookie and reports sign-out as unavailable.

Identity Platform does not select a tenant or grant workspace access. Hollis resolves a session to a user and then to an active workspace only through an existing tenant membership. A user with no membership can create a workspace or accept a valid invitation. Provider account linking never changes Hollis membership or role assignments.

Every protected route verifies the opaque Hollis session, resolves the active workspace, checks the required permission, and establishes tenant context before business logic runs. Tenant identity is never taken from caller-controlled request data.

PostgreSQL row-level security applies tenant context transactionally. Runtime roles must remain `NOSUPERUSER` and `NOBYPASSRLS`; application queries retain explicit tenant predicates as a second boundary.

## Domain modules

### Workspace controls

Hollis owns workspace profile, memberships, invitations, roles, permissions, and administrative audit records. Invitations are tenant-scoped, recipient-bound, short-lived, single-use, revocable, and accepted only by the matching authenticated identity. A workspace must retain at least one owner.

### Policy controls

New review cases bind to an existing published, versioned policy control. Historical cases retain their original binding. Hollis does not infer a policy from a customer's industry or accept arbitrary free-text policy identifiers for a case.

### Intake and review

An authorized member creates a tenant-scoped pending review case with an idempotent external reference and a durable review deadline. The database assigns a separate immutable Hollis Case Reference in the form `HL-YY-XXXX-XXXX`; it is opaque and does not encode organization, reviewer, risk, or sequence data. A reviewer claims a pending case, may escalate it, and records an explicit, rationale-backed final decision. Conditional state changes and their audit events commit in the same transaction.

The signed claims-webhook endpoint is reserved for a future approved integration. It verifies its signature and then returns `claims_workspace_resolution_unconfigured`; it does not create cases for public workspaces.

### Evidence

Evidence metadata records tenant scope, provenance, media type, integrity digest, verification state, retention state, and object reference. Raw evidence stays in the selected provider. Upload and download access uses short-lived object-specific signed URLs. Case exports include references and ordered review events, not raw evidence.

### Audit and export

Events are append-only and hash-linked. A database-generated sequence, not timestamps alone, determines event traversal. Corrections create new events rather than rewriting prior history. Exports are tenant-scoped reproducible packages with a manifest hash. Export filenames use the Hollis Case Reference, while the package retains the source reference for reconciliation with the originating system.

### Attestation

An authorized reviewer can generate a privacy-safe `hollis.adjudication-case.v1` document only after the review facts and policy binding meet the publisher requirements. The document contains bounded process facts, policy-control identifiers, evidence digests and verification state. It excludes raw evidence, personal data, policy text, model output, prompts, secrets, internal case identifiers, and audit events.

The public case-file route is unavailable unless `PUBLIC_ATTESTATION_ORIGIN` is a configured HTTPS API origin. Hollis generates a random public identifier and persists an immutable record before publication. Callers cannot supply their own public case-file URL.

After a completed human decision, Hollis generates the public-safe case file, submits it from its dedicated server-side execution account to the active policy-control contract, tracks finalization, and records the finalized per-case views. A legacy read-only importer remains isolated for historical records only. Neither path alters a human decision or blocks the core review workflow.

The managed runtime validates a dedicated server-side execution account and records one reusable contract deployment per exact tenant, policy-control binding, chain, and contract-source digest. Before activation, Hollis reads the immutable V7 policy binding from finalized state and compares it exactly with the registry request. Deployment retries resume from a recorded transaction hash; an uncertain submission is stopped for reconciliation instead of being submitted again. Per-case submissions use a separate durable idempotency record, retain their transaction hash, and read all three case-result views from finalized state. The customer workflow is automatic after an authorized human decision under an active policy control. The deployment and submission lifecycle remains observable and reconcilable by Hollis operators. See [ADR 0015](adr/0015-hollis-managed-genlayer-runtime.md).

Studio Next verifies declared process behavior only. Its result cannot establish legal correctness, substantive fairness, or the truth of private evidence.

## Trust boundaries

Every browser session, external identity token, API request, database transaction, object-storage operation, public case file, GenLayer result, and background job is a separate trust boundary. Authentication, tenant scope, authorization, input validation, integrity checks, and audit recording must be established again where applicable.

## Deferred production work

Commercial-production activation requires real-provider acceptance tests, shared rate limits, monitoring, backup and restore verification, incident response, an independent security review, and a formal operational-ownership model. These are tracked in [release-readiness-2026-09-16.md](release-readiness-2026-09-16.md).
