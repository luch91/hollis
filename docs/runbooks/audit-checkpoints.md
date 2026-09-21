# Audit checkpoint operation

Run the signed checkpoint scheduler through the approved recurring scheduler:

```text
pnpm --filter @hollis/api audit-checkpoints:run
```

It creates a single immutable Ed25519 checkpoint for each changed case-chain
head; re-running it is safe. Configure all three values together through the
secret manager: `AUDIT_CHECKPOINT_KEY_ID`,
`AUDIT_CHECKPOINT_PRIVATE_KEY_BASE64` (PKCS#8 DER), and
`AUDIT_CHECKPOINT_PUBLIC_KEY_BASE64` (SPKI DER). The private key never appears
in an export. Authorized auditors verify the included checkpoint with the
independent export verifier and the public key.

If signing is unconfigured or checkpoint verification fails, treat the export
as uncheckpointed or failed respectively. Do not attest a failed audit chain.
