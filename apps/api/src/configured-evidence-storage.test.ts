import { describe, expect, it, vi } from "vitest";
import type { Environment } from "./config.js";
import { createConfiguredEvidenceStorage } from "./configured-evidence-storage.js";
import type { EvidenceStorage } from "./evidence-storage.js";

const storage = {} as EvidenceStorage;

function environment(
  overrides: Partial<
    Pick<
      Environment,
      | "AWS_REGION"
      | "AZURE_STORAGE_ACCOUNT_NAME"
      | "AZURE_STORAGE_CONTAINER"
      | "GCS_BUCKET"
      | "GCS_PROJECT_ID"
      | "S3_BUCKET"
    >
  > = {},
) {
  return {
    AWS_REGION: undefined,
    AZURE_STORAGE_ACCOUNT_NAME: undefined,
    AZURE_STORAGE_CONTAINER: undefined,
    GCS_BUCKET: undefined,
    GCS_PROJECT_ID: "hollis-507001",
    S3_BUCKET: undefined,
    ...overrides,
  };
}

describe("configured evidence storage", () => {
  it("selects S3 when the validated S3 configuration is present", async () => {
    const createS3EvidenceStorage = vi.fn(() => storage);
    const createGoogleCloudEvidenceStorage = vi.fn(async () => storage);
    const createAzureBlobEvidenceStorage = vi.fn(() => storage);

    await expect(
      createConfiguredEvidenceStorage(
        environment({ AWS_REGION: "eu-west-1", S3_BUCKET: "hollis-test" }),
        {
          createGoogleCloudEvidenceStorage,
          createS3EvidenceStorage,
          createAzureBlobEvidenceStorage,
        },
      ),
    ).resolves.toBe(storage);

    expect(createS3EvidenceStorage).toHaveBeenCalledWith("eu-west-1", "hollis-test");
    expect(createGoogleCloudEvidenceStorage).not.toHaveBeenCalled();
  });

  it("selects Google Cloud Storage when its validated configuration is present", async () => {
    const createS3EvidenceStorage = vi.fn(() => storage);
    const createGoogleCloudEvidenceStorage = vi.fn(async () => storage);
    const createAzureBlobEvidenceStorage = vi.fn(() => storage);

    await expect(
      createConfiguredEvidenceStorage(
        environment({ GCS_BUCKET: "hollis-test", GCS_PROJECT_ID: "hollis-test-project" }),
        { createAzureBlobEvidenceStorage, createGoogleCloudEvidenceStorage, createS3EvidenceStorage },
      ),
    ).resolves.toBe(storage);

    expect(createGoogleCloudEvidenceStorage).toHaveBeenCalledWith(
      "hollis-test-project",
      "hollis-test",
    );
    expect(createS3EvidenceStorage).not.toHaveBeenCalled();
  });

  it("selects Azure Blob Storage when its validated configuration is present", async () => {
    const createAzureBlobEvidenceStorage = vi.fn(() => storage);
    const createS3EvidenceStorage = vi.fn(() => storage);
    const createGoogleCloudEvidenceStorage = vi.fn(async () => storage);

    await expect(
      createConfiguredEvidenceStorage(
        environment({
          AZURE_STORAGE_ACCOUNT_NAME: "hollisevidencedemo",
          AZURE_STORAGE_CONTAINER: "evidence",
        }),
        { createAzureBlobEvidenceStorage, createGoogleCloudEvidenceStorage, createS3EvidenceStorage },
      ),
    ).resolves.toBe(storage);

    expect(createAzureBlobEvidenceStorage).toHaveBeenCalledWith("hollisevidencedemo", "evidence");
    expect(createGoogleCloudEvidenceStorage).not.toHaveBeenCalled();
    expect(createS3EvidenceStorage).not.toHaveBeenCalled();
  });

  it("does not construct a storage client when no provider is configured", async () => {
    const createS3EvidenceStorage = vi.fn(() => storage);
    const createGoogleCloudEvidenceStorage = vi.fn(async () => storage);
    const createAzureBlobEvidenceStorage = vi.fn(() => storage);

    await expect(
      createConfiguredEvidenceStorage(environment(), {
          createGoogleCloudEvidenceStorage,
          createS3EvidenceStorage,
          createAzureBlobEvidenceStorage,
      }),
    ).resolves.toBeNull();

    expect(createGoogleCloudEvidenceStorage).not.toHaveBeenCalled();
    expect(createS3EvidenceStorage).not.toHaveBeenCalled();
  });
});
