import type { Environment } from "./config.js";
import { createGoogleCloudEvidenceStorage, type EvidenceStorage } from "./evidence-storage.js";
import { createS3EvidenceStorage } from "./s3-evidence-storage.js";
import { createAzureBlobEvidenceStorage } from "./azure-blob-evidence-storage.js";
import { createR2EvidenceStorage } from "./r2-evidence-storage.js";

type EvidenceStorageFactories = {
  createGoogleCloudEvidenceStorage: typeof createGoogleCloudEvidenceStorage;
  createS3EvidenceStorage: typeof createS3EvidenceStorage;
  createAzureBlobEvidenceStorage: typeof createAzureBlobEvidenceStorage;
  createR2EvidenceStorage: typeof createR2EvidenceStorage;
};

const defaultFactories: EvidenceStorageFactories = {
  createGoogleCloudEvidenceStorage,
  createS3EvidenceStorage,
  createAzureBlobEvidenceStorage,
  createR2EvidenceStorage,
};

export async function createConfiguredEvidenceStorage(
  environment: Pick<
    Environment,
    | "AWS_REGION"
    | "AZURE_STORAGE_ACCOUNT_NAME"
    | "AZURE_STORAGE_CONTAINER"
    | "GCS_BUCKET"
    | "GCS_PROJECT_ID"
    | "R2_ACCESS_KEY_ID"
    | "R2_ACCOUNT_ID"
    | "R2_BUCKET"
    | "R2_JURISDICTION"
    | "R2_SECRET_ACCESS_KEY"
    | "S3_BUCKET"
  >,
  factories: EvidenceStorageFactories = defaultFactories,
): Promise<EvidenceStorage | null> {
  if (environment.AZURE_STORAGE_ACCOUNT_NAME && environment.AZURE_STORAGE_CONTAINER) {
    return factories.createAzureBlobEvidenceStorage(
      environment.AZURE_STORAGE_ACCOUNT_NAME,
      environment.AZURE_STORAGE_CONTAINER,
    );
  }

  if (environment.S3_BUCKET && environment.AWS_REGION) {
    return factories.createS3EvidenceStorage(environment.AWS_REGION, environment.S3_BUCKET);
  }

  if (
    environment.R2_ACCOUNT_ID &&
    environment.R2_BUCKET &&
    environment.R2_ACCESS_KEY_ID &&
    environment.R2_SECRET_ACCESS_KEY
  ) {
    return factories.createR2EvidenceStorage(
      environment.R2_ACCOUNT_ID,
      environment.R2_BUCKET,
      environment.R2_ACCESS_KEY_ID,
      environment.R2_SECRET_ACCESS_KEY,
      environment.R2_JURISDICTION ?? "default",
    );
  }

  if (environment.GCS_BUCKET) {
    return factories.createGoogleCloudEvidenceStorage(
      environment.GCS_PROJECT_ID,
      environment.GCS_BUCKET,
    );
  }

  return null;
}
