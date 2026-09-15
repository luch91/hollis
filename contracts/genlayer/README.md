# GenLayer policy-process attestation

`policy_process_attestation_v7.py` is the active managed GenLayer contract source for Hollis.
It preserves V6 adjudication behavior and adds a read-only policy-binding view so Hollis can verify
the exact immutable constructor state before activating a policy-control deployment. V6 and V5 are
historical validation records. Earlier versions are historical drafts or deployment records.

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
genvm-lint check contracts/genlayer/policy_process_attestation_v7.py
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

Follow `DEPLOYMENT_V7.md` for the validated V7 deployment record. Before activating a new managed
policy-control deployment, rerun Studio Next schema extraction from the exact source revision and
record the result with the deployment evidence.
