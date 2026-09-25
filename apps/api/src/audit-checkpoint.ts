import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { canonicalJson } from "@hollis/contracts/canonical-case";

export type AuditCheckpoint = {
  algorithm: "ed25519";
  createdAt: Date;
  eventCount: number;
  headHash: string;
  keyId: string;
  signature: string;
};

export type AuditCheckpointSigner = {
  keyId: string;
  create(input: Omit<AuditCheckpoint, "algorithm" | "createdAt" | "signature">): AuditCheckpoint;
};

export function createAuditCheckpointSigner(input: {
  keyId: string;
  privateKeyBase64: string;
  publicKeyBase64: string;
}): AuditCheckpointSigner {
  const privateKey = createPrivateKey({
    format: "der",
    key: Buffer.from(input.privateKeyBase64, "base64"),
    type: "pkcs8",
  });
  const publicKey = createPublicKey({
    format: "der",
    key: Buffer.from(input.publicKeyBase64, "base64"),
    type: "spki",
  });
  return {
    keyId: input.keyId,
    create(value) {
      const createdAt = new Date();
      const payload = {
        ...value,
        algorithm: "ed25519" as const,
        createdAt: createdAt.toISOString(),
      };
      const signature = sign(
        null,
        Buffer.from(canonicalJson(payload), "utf8"),
        privateKey,
      ).toString("base64");
      if (
        !verify(
          null,
          Buffer.from(canonicalJson(payload), "utf8"),
          publicKey,
          Buffer.from(signature, "base64"),
        )
      ) {
        throw new Error("Audit checkpoint signature could not be verified locally.");
      }
      return { ...value, algorithm: "ed25519", createdAt, signature };
    },
  };
}
