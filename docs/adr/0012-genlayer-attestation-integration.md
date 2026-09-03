# ADR 0012: GenLayer process attestation integration

- Status: Proposed
- Date: 2026-08-30

## Context

Hollis needs a portable way to show that a finalized AI-governance process was evaluated against a
declared policy. GenLayer Intelligent Contracts can adjudicate cases that require interpretation,
while Hollis must retain control of evidence, tenant authorization, and the authoritative review
record.

## Decision

Plan a provider-neutral attestation module with a GenLayer adapter and a GenLayer Intelligent
Contract for policy-process adjudication. The module runs only after Hollis review finality and
receives a privacy-reviewed manifest containing hashes and minimal metadata.

The adapter maps submission, validator consensus, appeal, finality, and undetermined states into
explicit Hollis attestation states. A finalized attestation is appended as an `attestation_recorded`
event and included as a reference in authenticated exports.

GenLayer publication is asynchronous and cannot block, rewrite, or change a Hollis human decision.
Sensitive evidence, personal identifiers, prompts, policy documents, and raw model output remain
off-chain.

## Activation gates

- Complete a separate threat review for prompt injection, evidence leakage, replay, and validator
  disagreement.
- Define the GenLayer contract input schema, verdict vocabulary, appeal handling, and versioning.
- Implement contract, adapter, callback or polling, retry, and idempotency tests.
- Record an explicit activation decision before enabling publication for any tenant.

## Pre-activation implementation

Hollis defines versioned policy-control and adjudication-case schemas. The first GenLayer contract
checks only deterministic process facts from a public, privacy-reviewed case file: case commitment,
recorded human decision, and declared evidence requirements. Interpretive controls return
`needs_review` instead of claiming semantic compliance from commitments alone.

## Consequences

- Hollis remains useful if GenLayer is unavailable or disabled.
- Attestations are verifiable process evidence, not proof of legal correctness or substantive fairness.
- The adapter can support additional attestation networks without changing the review domain.
