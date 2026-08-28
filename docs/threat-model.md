# Initial Threat Model

## Protected assets

- Claim evidence and personal information
- Tenant configuration and intervention policies
- Reviewer identities, roles, and decisions
- Audit-event order and integrity
- Credentials, signing keys, and webhook secrets
- Evidence exports and external attestations

## Primary threats

| Threat | Required control |
| --- | --- |
| Cross-tenant data access | Tenant-scoped authorization, database row security, isolation tests |
| Reviewer impersonation | Enterprise authentication, strong sessions, step-up checks for sensitive actions |
| Evidence replacement | Content digests, immutable object versions, provenance metadata |
| Audit-history alteration | Append-only permissions, hash chaining, external checkpoints |
| Webhook forgery or replay | Signature verification, timestamp window, nonce or idempotency record |
| Prompt or document injection | Treat evidence as untrusted data, isolate tool permissions, require source-linked output |
| Sensitive data in logs | Structured allowlisted logging and automated log tests |
| Unauthorized adverse action | Server-side workflow state machine and mandatory authorized approval |
| Malicious policy change | Versioned policy approval, separation of duties, effective dates |
| Attestation data leakage | Minimal public metadata, salted identifiers where required, pre-publication review |

## Explicit exclusions from trust

- Browser state is not authoritative.
- Claims-system input is not trusted because it is authenticated.
- Automated explanations are not evidence.
- A hash does not establish that source data was accurate.
- Consensus does not replace an authorized human decision.

## Required work before production

- Complete role semantics for review assignment, decision approval, and administration.
- Extend tenant isolation tests to every new tenant-scoped table and query path.
- Select encrypted object storage and key management.
- Complete a data-flow inventory and privacy review.
- Define incident response, backup, recovery, retention, and deletion procedures.
- Perform application security testing and a third-party penetration test.
