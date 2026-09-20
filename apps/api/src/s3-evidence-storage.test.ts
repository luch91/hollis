import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { createS3EvidenceStorage } from "./s3-evidence-storage.js";

const getSignedUrl = vi.hoisted(() => vi.fn(async () => "https://storage.test/signed"));

vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl }));

const tenantId = "tenant-1";
const objectName = `tenants/${tenantId}/evidence/${"a".repeat(64)}`;
const content = Buffer.from("verified evidence");
const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;

describe("S3 evidence storage", () => {
  it("signs downloads against the recorded immutable version", async () => {
    const storage = createS3EvidenceStorage("eu-west-1", "hollis-evidence-test", {
      send: vi.fn(),
    } as unknown as S3Client);

    await expect(storage.createDownloadUrl(tenantId, objectName, "version-42")).resolves.toBe(
      "https://storage.test/signed",
    );
    const command = getSignedUrl.mock.calls.at(-1)?.[1];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect((command as GetObjectCommand).input).toMatchObject({
      Bucket: "hollis-evidence-test",
      Key: objectName,
      VersionId: "version-42",
    });
  });

  it("stores evidence under the tenant path", async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = createS3EvidenceStorage("eu-west-1", "hollis-evidence-test", {
      send,
    } as unknown as S3Client);

    await expect(storage.put(tenantId, objectName, content, "text/plain", digest)).resolves.toEqual(
      {
        digest,
        mediaType: "text/plain",
        objectName,
        sizeBytes: content.byteLength,
      },
    );

    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Body: content,
      Bucket: "hollis-evidence-test",
      ContentType: "text/plain",
      Key: objectName,
    });
  });

  it("verifies stored bytes and declared metadata", async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof HeadObjectCommand) {
        return { ContentLength: content.byteLength, ContentType: "text/plain" };
      }
      if (command instanceof GetObjectCommand) {
        return { Body: Readable.from([content]) };
      }
      throw new Error("Unexpected S3 command.");
    });
    const storage = createS3EvidenceStorage("eu-west-1", "hollis-evidence-test", {
      send,
    } as unknown as S3Client);

    await expect(
      storage.verify(tenantId, objectName, {
        digest,
        mediaType: "text/plain",
        sizeBytes: content.byteLength,
      }),
    ).resolves.toEqual({
      digest,
      mediaType: "text/plain",
      objectName,
      providerEtag: null,
      providerVersion: null,
      sizeBytes: content.byteLength,
    });
  });

  it("rejects objects outside the tenant boundary", async () => {
    const send = vi.fn();
    const storage = createS3EvidenceStorage("eu-west-1", "hollis-evidence-test", {
      send,
    } as unknown as S3Client);

    await expect(
      storage.delete(tenantId, `tenants/tenant-2/evidence/${"a".repeat(64)}`),
    ).rejects.toThrow("outside the tenant boundary");
    expect(send).not.toHaveBeenCalled();
  });

  it("deletes the exact tenant object", async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = createS3EvidenceStorage("eu-west-1", "hollis-evidence-test", {
      send,
    } as unknown as S3Client);

    await storage.delete(tenantId, objectName);

    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toMatchObject({ Bucket: "hollis-evidence-test", Key: objectName });
  });
});
