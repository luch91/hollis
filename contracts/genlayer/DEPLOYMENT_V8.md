# V8 GenLayer deployment record

Status: deployed for the isolated hackathon demo; not production policy activation.

V8 is the first candidate that binds a Hollis runtime identity, recomputes the
`hollis.case-commitment.v1` value, and prohibits a second terminal result for
the same commitment. Deploy it only to Studio Next (chain ID `61997`) from the
exact reviewed source artifact.

## Recorded demo deployment (2026-09-21)

| Field | Verified value |
| --- | --- |
| Network / chain | Studio Next / `61997` |
| RPC endpoint | `https://studio-next.genlayer.com/api` |
| Contract address | `0xaC0856088030c1dBdA316f8a98dEe88c7e95d66c` |
| Deployment transaction | `0x173f2fc4f89cfc1eb7857e42931e9856496109b48e573adbbbeb012de5db3fd2` |
| Finality | `FINALIZED`, accepted, `FINISHED_WITH_RETURN` |
| Source version / SHA-256 | `v8` / `5cac7ea7b956202f6f79e8feb74d5ba8d8680afe988219bfb1ebfb1b538c3be7` |
| Authorized runtime | `0x07ef89c4d275d9b4aca77f07929f656a11129abf` |

The contract’s public views were read after finalization. They returned
`hollis.policy-process-attestation.v8` and the immutable demo binding:

```text
policyId: truvyx-release-governance
policyVersion: release-governance-1.0
policyControlId: independent-human-approval
policyControlVersion: 1.0
policyDocumentDigest: sha256:63912e39d3103a743b6853bf48b3fb9627183cf6708e1a8af603532cafe519d8
evidenceRequirement: verified_reference_required
interpretation: deterministic
```

This is intentionally synthetic demo data. It must not be configured as the
production Hollis policy binding. V7 remains the historical deployment and has
not been replaced.

Before activation, record:

- source SHA-256 and the complete V8 constructor arguments;
- Studio Next network, chain ID, contract address, deployment transaction, and
  authorized runtime address;
- the exact published policy binding and deployed source version;
- one valid finalization, an unauthorized caller rejection, a replay rejection,
  and an overwrite rejection, with transaction identifiers;
- the bounded HTTPS document used for the test and its canonical commitment;
- the outcome of the Studio schema/runtime validation and the reviewer who
  approved the evidence.

Do not store credentials, raw evidence, private case IDs, signed URLs, or
policy documents in this record. A V7 address or receipt remains historical and
must be labelled legacy in the UI and exports.
