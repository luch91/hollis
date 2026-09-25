# V9 GenLayer deployment record

Status: active for the disposable external-auditor workflow on Studio Next.

V9 corrects the canonical policy-shape mismatch found during a real production submission. It
recomputes the canonical commitment from `canonicalRecord`, validates the complete policy control
from the public case file, cross-checks both policy representations, authorizes only the Hollis
runtime account, and preserves one terminal result per case commitment.

## Recorded deployment (2026-09-23)

| Field | Verified value |
| --- | --- |
| Network / chain | Studio Next / `61997` |
| RPC endpoint | `https://studio-next.genlayer.com/api` |
| Contract address | `0x384Dd3c0CDf66b44Ce9bBfcB5105044Ed35b8118` |
| Deployment transaction | `0x063c41cfc40cf0896b1bf66492374c02105058c3a5826b2ab5bbd82b2b163ddc` |
| Source version / SHA-256 | `v9` / `1e9a1d648336b95243824d1523f408627616e3a85f9c03309b636b9954e0c8f3` |
| Authorized runtime | `0x07ef89C4d275D9b4aCA77f07929f656a11129abf` |
| Policy ID / version | `external-audit-1790175886734` / `1.0` |
| Control ID / version | `human-review-required` / `1.0` |
| Evidence requirement | `verified_reference_required` |
| Interpretation | `deterministic` |

The disposable workflow finalized attestation transaction
`0x6f154cafd2497c6e7a1729e75bc59291ead47dc7547e01bd9143c0ca72f46453` with verdict `pass` and
reason `requirements_satisfied`. No private evidence, credential, user identifier, tenant
identifier, or private case identifier is recorded here.

The prior V8 contract remains historical. Hollis automatically supersedes a failed V8 deployment
with a binding-equivalent V9 deployment and scopes submission idempotency to that deployment. A
submitted or finalized historical result is never retried or overwritten.
