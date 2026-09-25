# GenLayer policy-process attestation

`policy_process_attestation_v9.py` is the only source eligible for a new managed GenLayer
deployment. It preserves the earlier read-only binding view and enforces runtime-caller authorization,
canonical-case-commitment recomputation, strict fetched-document validation, and one terminal write
per case commitment. It is not a deployment record: do not represent V9 as active until the approved
Studio Next workflow has recorded its deployment and negative authorization tests. V8 and earlier
sources are read-only historical verification records and never satisfy the V9 guarantee.

It fetches a public, privacy-reviewed adjudication case file and uses GenLayer exact-match consensus
to verify deterministic process conditions:

- The public case-file commitment matches the contract commitment.
- A human decision was recorded.
- The declared evidence requirement is satisfied.

For controls marked `judgment_required`, it returns `needs_review`. Hollis must not send raw
evidence, personal claim data, policy documents, model output, secrets, or prompts to GenLayer.
Semantic policy adjudication remains disabled until a separate activation decision defines a
privacy-safe source and reviewable contract behavior.

Validate the contract with the GenLayer linter before deployment:

```text
genvm-lint check contracts/genlayer/policy_process_attestation_v9.py
```

The contract follows the Studio Next v0.3 source format: `gl.contract.Contract`,
`@gl.public`, `gl.nondet.web.get`, `TreeMap` persistent storage, and
`gl.eq_principle.strict_eq`. Its required `py-genlayer` dependency pin is declared in the source
header and must not be replaced without a successful Studio Next schema check.

## Studio preview

Validate this contract in Studio Next at `https://studio-next.genlayer.com`. Hollis uses chain ID
`61997` with JSON-RPC at `https://studio-next.genlayer.com/api`.

V2 and V3 are historical diagnostic deployments whose finalized pass writes exposed distinct
integration defects. Their full records are in `DEPLOYMENT_V2.md` and `DEPLOYMENT_V3.md`. V5 has
verified representative pass and fail executions in `DEPLOYMENT_V5.md`. The first Truvyx-bound V6
deployment is recorded in `DEPLOYMENT_V7.md` and must not be activated because its retained
representative results fail the policy-digest check. Studio Next execution results must not be
treated as Clarke or Mainnet pricing.

Use [DEPLOYMENT_V8.md](DEPLOYMENT_V8.md) as the historical evidence template before activating a new managed policy-control
deployment. Rerun Studio Next schema extraction from the exact source revision and record the
source digest, runtime address, policy binding, chain ID, transaction identifiers, and negative
authorization/replay/overwrite results with the deployment evidence.
