# Deployment

## API container

Build the API image from the repository root:

```sh
docker build -f apps/api/Dockerfile -t hollis-api:local .
```

The image runs as the non-root `node` user and contains no credentials. At runtime, the API binds to
`0.0.0.0`. It uses `API_PORT` when supplied, otherwise it honors the platform-provided `PORT` value,
then falls back to `4000` for local development.

## Cloud Run

Before deployment, run the read-only [Cloud Run preflight](cloud-run-preflight.md). It checks the
approved resources and permissions without reading secret values or changing cloud state.

Deploy the image to Cloud Run with the dedicated service account
`hollis-evidence-runtime@hollis-507001.iam.gserviceaccount.com`. Supply either `DATABASE_URL`, or
the complete `DB_NAME`, `DB_USER`, `DB_PASS`, and `INSTANCE_UNIX_SOCKET` set, plus
`GCS_PROJECT_ID`, `GCS_BUCKET`, and the WorkOS settings through Secret Manager or managed runtime
configuration. Never place connection strings, tokens, or keys in the image or repository.

If GenLayer public case-file publishing is enabled, set `PUBLIC_ATTESTATION_ORIGIN` to the Cloud
Run service's externally reachable HTTPS origin. It must route
`GET /v1/public/attestation-case-files/:publicCaseFileId` without WorkOS authentication. This is a
public-safe document route only. Do not make authenticated review, evidence, export, retention, or
administrative routes public.

The provisioned Cloud SQL instance is `hollis-507001:europe-west1:hollis-postgres`, with database
`hollis`. Cloud Run must attach this instance with its Cloud SQL integration and use a Unix socket
connection. Set `INSTANCE_UNIX_SOCKET` to
`/cloudsql/hollis-507001:europe-west1:hollis-postgres`, and map the existing runtime database user,
password, and database-name secrets to `DB_USER`, `DB_PASS`, and `DB_NAME`. The runtime service
account must have `roles/cloudsql.client` and access only to the runtime database secrets. The
migration password is reserved for controlled migration execution.

The Cloud Run service must use the same EU deployment region selected for the application workload.
The region is separate from the Cloud Storage EU multi-region bucket and must be recorded before
deployment. Do not set `API_HOST` in Cloud Run. The API defaults to `0.0.0.0`, and Cloud Run's
injected `PORT` is honored when `API_PORT` is absent.

Production configuration fails closed unless the claims webhook secret and evidence bucket are set,
the console origin uses HTTPS, and the API host is `0.0.0.0`.

## Retention scheduler

Run the one-shot scheduler as a separate authenticated Cloud Run job or request target. Supply
`RETENTION_TENANT_IDS` explicitly. Cloud Scheduler must use OIDC with a dedicated caller identity;
do not make the retention endpoint public.
