# GenLayer policy-process attestation

`policy_process_attestation.py` is the pre-activation GenLayer contract for Hollis.

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
genvm-lint check contracts/genlayer/policy_process_attestation.py
```

The contract uses the documented `gl.Contract`, `@gl.public`, `gl.nondet.web.get`, and
`gl.eq_principle.strict_eq` interfaces. It is not deployed or called by the Hollis API.
