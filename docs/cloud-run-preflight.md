# Archived Cloud Run Preflight

> This is an archival record of the former Google Cloud deployment preflight. It references retired WorkOS and Cloud Run assumptions and must not be used to deploy the active product. It is retained only to preserve the history of prior infrastructure checks. The current deployment contract is [deployment.md](deployment.md); it does not authorize a provider-specific deployment while the production target remains undecided.

Run this read-only command before deploying the Hollis API. It verifies approved resource names,
regions, service-account permissions, bucket controls, and secret names. It never reads a secret
value, creates a secret, creates a service, or deploys an image.

```powershell
pnpm cloud:preflight -- `
  --project hollis-507001 `
  --region europe-west1 `
  --repository hollis `
  --instance hollis-postgres `
  --bucket hollis-evidence-429498177112 `
  --bucket-location EU `
  --service-account hollis-evidence-runtime@hollis-507001.iam.gserviceaccount.com `
  --claims-webhook-secret hollis-claims-webhook-secret
```

The final option names the production claims-webhook secret that an authorized operator has created.
The command fails until that secret exists. It does not accept a secret value.

After the preflight passes, the operator must still supply the verified HTTPS reviewer-console origin
and perform the deliberate Cloud Run deployment. See [deployment](deployment.md).
