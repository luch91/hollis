# ADR 0016: Canonical case commitment

## Status

Accepted for implementation on 2026-09-19.

## Context

The original adjudication case file reused the review export manifest hash as its case commitment. The export manifest binds the case row and ordered audit events, but it does not bind the managed evidence verification state or the complete published policy-control binding used by GenLayer. A public case file could therefore describe evidence that was not part of the value called the case commitment.

Hollis needs one versioned commitment that is reproduced by authenticated exports, privacy-safe public case files, managed attestation, import verification, and independent tooling. The public representation must not reveal internal case identifiers, the Hollis Case Reference, external source references, reviewer identity, rationale, automated recommendation, or raw evidence.

## Decision

Hollis defines `hollis.case-commitment.v1` as SHA-256 over a domain string, one line-feed byte, and canonical UTF-8 JSON:

```text
sha256("hollis.case-commitment.v1\n" || canonicalJson(record))
```

The record schema is `hollis.canonical-case.v1`. Canonicalization is `hollis.canonical-json.v1`.

### Canonical JSON rules

- Object keys are sorted by Unicode scalar value without locale dependence. Schema keys are ASCII.
- Array order is preserved and is significant.
- Strings use JSON escaping and UTF-8 encoding.
- Numbers are limited to safe integers. The V1 record currently contains no numeric field.
- `null`, booleans, strings, arrays, and objects are supported.
- Undefined values, floating-point values, non-safe integers, and other runtime types are rejected.
- No insignificant whitespace is emitted.

Language-neutral test vectors live under `contracts/canonical/test-vectors/`. Node.js and Python implementations must both match every vector before release.

### Domain separation

V1 uses separate domains for separate claims:

| Purpose | Domain |
| --- | --- |
| Complete case commitment | `hollis.case-commitment.v1` |
| Private case identity | `hollis.case-identity.v1` |
| Decision-bound audit manifest | `hollis.decision-audit.v1` |
| Private review facts | `hollis.private-review-facts.v1` |
| Reviewer actions | `hollis.reviewer-action.v1` |

Reusing a digest produced under one domain for another purpose is invalid.

### Public canonical record

The public canonical record contains:

- a decision-bound audit manifest over the completed case and ordered events through the final
  `decision_recorded` event;
- a commitment to the internal case UUID and Hollis Case Reference;
- the complete ordered evidence digest, media type, and verification-state list;
- policy ID, policy version, control ID, control version, and policy-document digest;
- a commitment to private review facts;
- whether a human decision and escalation were recorded;
- the bounded human decision outcome;
- a commitment to ordered reviewer-action audit events; and
- explicit canonicalization and record schema versions.

Evidence order is the authoritative attachment order and is commitment-significant. A change in evidence order, digest, media type, verification state, policy binding, decision outcome, reviewer actions, private facts, audit manifest, or schema version produces a different case commitment.

The decision-bound manifest deliberately excludes later attestation lifecycle events. The general
review export manifest continues to cover every current event and can therefore evolve after
publication. Excluding only post-decision lifecycle events keeps the case commitment stable across
export, publication, submission, and receipt recording without weakening the append-only audit log.

### Private facts

`hollis.private-review-facts.v1` binds the following without publishing their values:

- external reference;
- automated-system version and recommendation;
- risk level and review deadline;
- creation, assignment, escalation, and decision timestamps;
- assignee, escalator, and decision-maker identifiers;
- escalation reason;
- decision rationale; and
- final recommendation.

The private commitment does not make these facts public. An authorized export holder can independently recompute it from the authenticated export.

### Disclosure and mutability

| Field group | Public representation | Before completion | After completion |
| --- | --- | --- | --- |
| Internal case UUID, Hollis reference | Domain-separated commitment only | Identity is fixed at creation | Immutable |
| External reference, system version, recommendation, risk, deadline | Private facts commitment only | Fixed at intake under the current workflow | Immutable |
| Assignment, escalation, reviewer identity, rationale, final recommendation, timestamps | Private facts and reviewer-action commitments; bounded outcome is public | Changes only through authorized workflow transitions | Immutable decision record; later lifecycle events do not rewrite it |
| Policy and control IDs, versions, policy digest | Public exact values | Fixed at case creation to a published version | Immutable historical binding |
| Evidence digest, media type, verification state, order | Public exact values | Attachments may be added and verified while the case is open | Frozen; attachment creation and verification changes are rejected |
| Decision outcome and escalation-present flag | Public bounded values | Produced by authorized workflow transitions | Immutable |
| Raw evidence, policy text, prompts, model output, secrets | Never included | Governed by their private stores | Never included |
| Post-decision attestation events | Excluded from the case commitment; retained in the audit export | Not applicable | Append-only lifecycle history |

### Lifecycle

A V1 canonical commitment exists only for a completed case with a complete human decision and at least one managed evidence record. All managed evidence must be verified before decision completion. Evidence attachment is rejected after completion. Case-row locking serializes evidence attachment and completion so a completed commitment cannot race with a new attachment.

The current database remains authoritative. The canonical record is derived from the export, managed evidence, and exact published policy binding. Later evidence-ledger work may persist a frozen snapshot, but it must reproduce this V1 record exactly or introduce a new explicit version.

### Compatibility

- `hollis.review-export.v1` remains readable. New completed exports include an optional `canonical` block with the V1 record, version, and case commitment.
- New `hollis.adjudication-case.v1` files include `canonicalRecord` and `commitmentVersion`. The V7 reader ignores unknown fields and continues comparing the submitted `caseCommitment` value.
- Historical exports and case files without `canonical` or `commitmentVersion` are legacy audit-manifest commitments. User interfaces must label them as legacy and must not imply V1 coverage.
- Historical finalized receipts are not rewritten.

## Verification

- `packages/contracts/src/canonical-case.test.ts` verifies Node.js canonicalization, domain separation, and shared vectors.
- `contracts/canonical/tests/test_canonical_case.py` independently verifies the same vectors and mutation behavior in Python 3.12.
- API tests verify that completed case files contain the new commitment and that evidence order changes it.
- Browser tests verify commitment value and version remain synchronized across the case, export, and public attestation views.

## Consequences

The case commitment now binds the evidence and policy facts evaluated by attestation instead of only the audit export. Private facts remain undisclosed but are cryptographically bound. Any future schema or canonicalization change requires a new version and new test vectors. V7 remains a historical contract and does not gain authorization or write-once semantics through this ADR; those controls belong to the later GenLayer contract task.
