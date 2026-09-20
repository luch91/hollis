import { S3Client } from "@aws-sdk/client-s3";
import { createS3EvidenceStorage } from "./s3-evidence-storage.js";

export function createR2EvidenceStorage(
  accountId: string,
  bucketName: string,
  accessKeyId: string,
  secretAccessKey: string,
  jurisdiction: "default" | "eu" = "default",
) {
  const host =
    jurisdiction === "eu"
      ? `${accountId}.eu.r2.cloudflarestorage.com`
      : `${accountId}.r2.cloudflarestorage.com`;

  return createS3EvidenceStorage(
    "auto",
    bucketName,
    new S3Client({
      credentials: { accessKeyId, secretAccessKey },
      endpoint: `https://${host}`,
      forcePathStyle: true,
      region: "auto",
    }),
  );
}
