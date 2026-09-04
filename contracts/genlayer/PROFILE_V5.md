# V5 Studio Dev fee-profile procedure

This procedure does not authorize using or sharing a personal wallet private key.

## Preconditions

- `policy_process_attestation_v5.py` is accepted by Studio Dev schema extraction using its declared
  `py-genlayer` dependency pin.
- The pass and fail fixtures in `DEPLOYMENT_V5.md` return HTTP 200 from their approved public
  URL.
- An operator configures a separate funded Studio Dev test account only on their own machine. Its
  private key stays in an ignored `gltest.config.yaml` and is never added to this repository, a
  shell history, chat, or CI logs.
- The account has sufficient GEN according to a fresh Studio Dev fee estimate.

## Matching test tooling

Use an isolated virtual environment with the matching release candidates:

```text
python -m venv .venv
.venv\Scripts\python -m pip install genlayer-test==0.30.0rc2
```

## Run and collect

Set `HOLLIS_ENABLE_STUDIO_DEVNET_INTEGRATION=1` in the operator's current process, then run:

```text
.venv\Scripts\python -m pytest contracts/genlayer/tests/integration/test_policy_process_attestation_v5.py --network studio_devnet --fee-profile contracts/genlayer/artifacts/studio-dev-fee-profile.json
```

The test deploys V5 and finalizes the representative pass and fail writes. It obtains a current
transaction fee preset through the GenLayer client for each write. Do not reuse an old preset and do
not hardcode the profile into application code.

After the run, record the contract address, deployment transaction, both write transactions,
finalization times, returned verdicts, evaluation reasons, and the profile contents in `DEPLOYMENT_V5.md`. Commit the
profile only after the entries are complete and independently checked against the Studio receipts.
