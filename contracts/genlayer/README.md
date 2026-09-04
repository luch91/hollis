# GenLayer policy-process attestation

`policy_process_attestation_v2.py` is the pre-activation GenLayer contract for Hollis. The
earlier `policy_process_attestation.py` is retained only as an undeployed historical draft.

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
genvm-lint check contracts/genlayer/policy_process_attestation_v2.py
```

The contract follows the current Studio v0.3 source format: `gl.contract.Contract`,
`@gl.public`, `gl.nondet.web.render`, and `gl.eq_principle.strict_eq`. It is not deployed or
called by the Hollis API.

## Studio preview

Validate this contract in the provided Studio preview at
`https://studio-next.genlayer.com`. The preview currently identifies itself as `GenLayer Studio
Dev` on chain ID `61997`, with JSON-RPC at `https://studio-dev.genlayer.com/api`.

Before Hollis activation, an authorized operator must deploy the contract in that Studio, record the
resulting address and contract version, and run representative finalized adjudication transactions.
Those executions are the source for the checked-in fee profile. Studio execution results must not be
treated as Clarke or Mainnet pricing, and no fee values are committed until they have been measured.

The Studio Dev runner currently rejects this source and GenLayer's own current Studio example during
schema extraction. The reproducible issue is tracked at
https://github.com/genlayerlabs/genlayer-studio/issues/1757. Deployment and fee-profile execution
remain pending that platform fix.
