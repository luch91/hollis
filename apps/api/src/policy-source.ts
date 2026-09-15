import { createHash } from "node:crypto";
import {
  policySourceMediaTypeSchema,
  policySourceSchema,
  type CreatePolicyVersion,
} from "@hollis/contracts";
import type { EvidenceStorage } from "./evidence-storage.js";

const maximumPolicySourceBytes = 5_242_880;

export class PolicySourceError extends Error {
  constructor(
    readonly code:
      | "policy_source_invalid"
      | "policy_source_too_large"
      | "policy_source_unavailable"
      | "policy_source_unsupported",
  ) {
    super(code);
    this.name = "PolicySourceError";
  }
}

export function createPolicySource(input: {
  content: Buffer;
  fileName: string;
  mediaType: string;
}) {
  const mediaType = policySourceMediaTypeSchema.safeParse(input.mediaType);
  if (!mediaType.success) throw new PolicySourceError("policy_source_unsupported");
  const fileName = normalizeFileName(input.fileName);
  if (!input.content.byteLength) throw new PolicySourceError("policy_source_invalid");
  if (input.content.byteLength > maximumPolicySourceBytes) {
    throw new PolicySourceError("policy_source_too_large");
  }
  if (!matchesDeclaredMediaType(input.content, mediaType.data)) {
    throw new PolicySourceError("policy_source_invalid");
  }

  const digest = `sha256:${createHash("sha256").update(input.content).digest("hex")}`;
  return {
    digest,
    fileName,
    mediaType: mediaType.data,
    sizeBytes: input.content.byteLength,
  };
}

export function policySourceObjectName(tenantId: string, digest: string): string {
  if (!/^[0-9a-f-]{36}$/.test(tenantId)) throw new PolicySourceError("policy_source_invalid");
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new PolicySourceError("policy_source_invalid");
  return `tenants/${tenantId}/policy-sources/${digest.slice("sha256:".length)}`;
}

export async function assertStoredPolicySource(
  tenantId: string,
  input: CreatePolicyVersion,
  storage: EvidenceStorage,
): Promise<void> {
  const source = policySourceSchema.parse(input.source);
  try {
    await storage.verify(tenantId, policySourceObjectName(tenantId, input.documentDigest), {
      digest: input.documentDigest,
      mediaType: source.mediaType,
      sizeBytes: source.sizeBytes,
    });
  } catch {
    throw new PolicySourceError("policy_source_unavailable");
  }
}

function normalizeFileName(value: string): string {
  const fileName = value.trim();
  if (!fileName || fileName.length > 255 || hasForbiddenFileNameCharacter(fileName)) {
    throw new PolicySourceError("policy_source_invalid");
  }
  return fileName;
}

function hasForbiddenFileNameCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return character === "/" || character === "\\" || codePoint < 32;
  });
}

function matchesDeclaredMediaType(
  content: Buffer,
  mediaType: (typeof policySourceMediaTypeSchema)["_output"],
): boolean {
  if (mediaType === "application/pdf") return content.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return content.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(content);
    return true;
  } catch {
    return false;
  }
}
