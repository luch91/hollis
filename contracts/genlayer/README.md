# GenLayer policy-process attestation

`policy_process_attestation_v4.py` is the pre-activation GenLayer contract for Hollis. V1 is an
undeployed historical draft, and V2 and V3 are immutable Studio Dev deployment records with failed
adjudication executions.

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
genvm-lint check contracts/genlayer/policy_process_attestation_v4.py
```

The contract follows the current Studio v0.3 source format: `gl.contract.Contract`,
`@gl.public`, `gl.nondet.web.render`, and `gl.eq_principle.strict_eq`. It is not deployed or
called by the Hollis API. Its required `py-genlayer` dependency pin is declared in the source
header and must not be replaced without a successful Studio Dev schema check.

## Studio preview

Validate this contract in the provided Studio preview at
`https://studio-next.genlayer.com`. The preview currently identifies itself as `GenLayer Studio
Dev` on chain ID `61997`, with JSON-RPC at `https://studio-dev.genlayer.com/api`.

V2 and V3 were deployed to Studio Dev but their finalized pass writes exposed distinct integration
defects. Their full records are in `DEPLOYMENT_V2.md` and `DEPLOYMENT_V3.md`. Deploy V4 only after
Studio Dev accepts its schema, then follow `DEPLOYMENT_V4.md` and `PROFILE_V4.md`. Studio execution
results must not be treated as Clarke or Mainnet pricing.

Studio Dev schema extraction has been verified for V3. Before deployment, rerun that check from the
exact source revision being deployed and record the result with the deployment evidence.
