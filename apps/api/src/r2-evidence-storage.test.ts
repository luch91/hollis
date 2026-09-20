import type { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import type { EvidenceStorage } from "./evidence-storage.js";

const { createS3EvidenceStorage } = vi.hoisted(() => ({
  createS3EvidenceStorage: vi.fn(),
}));

vi.mock("./s3-evidence-storage.js", () => ({ createS3EvidenceStorage }));

import { createR2EvidenceStorage } from "./r2-evidence-storage.js";

describe("R2 evidence storage", () => {
  it("uses Cloudflare's path-style endpoint for the selected jurisdiction", async () => {
    const storage = {} as EvidenceStorage;
    createS3EvidenceStorage.mockReturnValue(storage);

    expect(
      createR2EvidenceStorage("account-id", "hollis-evidence", "access-key", "secret-key", "eu"),
    ).toBe(storage);

    const [region, bucketName, client] = createS3EvidenceStorage.mock.calls[0] as [
      string,
      string,
      S3Client,
    ];
    expect(region).toBe("auto");
    expect(bucketName).toBe("hollis-evidence");
    expect(client.config.forcePathStyle).toBe(true);
    const endpoint = client.config.endpoint;
    if (!endpoint) throw new Error("Expected the R2 endpoint to be configured.");
    await expect(endpoint()).resolves.toMatchObject({
      hostname: "account-id.eu.r2.cloudflarestorage.com",
      protocol: "https:",
    });
  });
});
