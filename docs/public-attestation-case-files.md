# Public attestation case files

GenLayer validators need an HTTPS-readable case file. Hollis publishes a distinct privacy-safe
document for that purpose instead of exposing evidence exports or accepting an arbitrary URL from a
reviewer.

## Required runtime setting

Set `PUBLIC_ATTESTATION_ORIGIN` to the externally reachable HTTPS origin of the Hollis API.

```text
PUBLIC_ATTESTATION_ORIGIN=https://api.example.com
```

This must be the API origin, not the reviewer-console URL, unless that URL actually routes the
public API endpoint. It must be configured before a reviewer can generate a public attestation case
file.

## Flow

1. An authorized reviewer completes a review and declares the policy control.
2. Hollis creates an immutable database record with a random public UUID and the validated
   `hollis.adjudication-case.v1` document.
3. The public URL serves only that document at
   `/v1/public/attestation-case-files/:publicCaseFileId`.
4. An authorized operator submits the commitment and generated URL to the configured GenLayer
   contract from Studio.
5. The reviewer enters the finalized transaction hash. Hollis verifies the transaction against the
   stored case file and imports the result.

## Public-data boundary

The public route returns only the case commitment, policy-control metadata, boolean review facts,
review outcome, evidence digests, evidence media types, and evidence verification state. Do not add
raw evidence, personal data, policy text, model output, prompts, secrets, internal identifiers, or
audit events to this schema.

## Revocation and retention

The initial publisher does not expose a reviewer revocation action. The persistence model reserves
`revoked_at` so that a future authorized lifecycle feature can make an existing public URL return
404. Any such feature must record an append-only audit event and account for a case file already
observed by GenLayer validators.
