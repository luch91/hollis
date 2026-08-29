# Deployment

## API container

Build the API image from the repository root:

```sh
docker build -f apps/api/Dockerfile -t hollis-api:local .
```

The image listens on port `4000` and runs as the non-root `node` user. It contains no credentials.

## Cloud Run

Deploy the image to Cloud Run with the dedicated service account
`hollis-evidence-runtime@hollis-507001.iam.gserviceaccount.com`. Supply `DATABASE_URL`,
`GCS_PROJECT_ID`, `GCS_BUCKET`, and the WorkOS settings through Secret Manager or managed runtime
configuration. Never place connection strings, tokens, or keys in the image or repository.

The Cloud Run service must use the same EU deployment region selected for the application workload.
The region is separate from the Cloud Storage EU multi-region bucket and must be recorded before
deployment.

## Retention scheduler

Run the one-shot scheduler as a separate authenticated Cloud Run job or request target. Supply
`RETENTION_TENANT_IDS` explicitly. Cloud Scheduler must use OIDC with a dedicated caller identity;
do not make the retention endpoint public.
