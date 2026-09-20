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

1. An authorized reviewer completes a review under a published policy control.
2. Hollis creates an immutable database record with a random public UUID and the validated
   `hollis.adjudication-case.v1` document. New documents contain the same
   `hollis.case-commitment.v1` value and canonical record as the authenticated case export.
3. The public URL serves only that document at
   `/v1/public/attestation-case-files/:publicCaseFileId`.
4. Hollis submits the commitment and generated URL from its dedicated server-side execution
   account to the active GenLayer Studio Next policy-control contract.
5. Hollis waits for finality, verifies the contract result against the stored case file, and records
   the portable receipt. The customer does not use a wallet, operate Studio, or enter a transaction
   hash.

The historical read-only importer is documented separately in
[genlayer-studio-import.md](genlayer-studio-import.md). It is not part of the standard customer
workflow.

## Public-data boundary

The public route returns only the case commitment, policy-control metadata, boolean review facts,
review outcome, evidence digests, evidence media types, and evidence verification state. Do not add
raw evidence, personal data, policy text, model output, prompts, secrets, internal identifiers, or
audit events to this schema.

The canonical record contains commitments to private identity, reviewer action, and other private
review facts. It does not reveal those values. Evidence array order is binding. Historical files
without `canonicalRecord` and `commitmentVersion` remain readable and are explicitly treated as
legacy records.

## Independent verification

Save either an authenticated JSON export or a public case-file response, then run:

```powershell
.venv\Scripts\python.exe contracts/canonical/verify_canonical_case.py case-file.json
```

The verifier selects `canonical` from an authenticated export or `canonicalRecord` from a public
case file, applies the versioned canonical JSON rules, and fails if any bound field, evidence order,
version, or commitment value differs.

## Revocation and retention

The initial publisher does not expose a reviewer revocation action. The persistence model reserves
`revoked_at` so that a future authorized lifecycle feature can make an existing public URL return
404. Any such feature must record an append-only audit event and account for a case file already
observed by GenLayer validators.
