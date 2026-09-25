import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAuditCheckpointSigner } from "./audit-checkpoint.js";

describe("audit checkpoints", () => {
  it("signs a bounded checkpoint with an Ed25519 key pair", () => {
    const keys = generateKeyPairSync("ed25519");
    const signer = createAuditCheckpointSigner({
      keyId: "e2e-checkpoint-key-1",
      privateKeyBase64: keys.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
      publicKeyBase64: keys.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    });
    const checkpoint = signer.create({
      eventCount: 3,
      headHash: `sha256:${"a".repeat(64)}`,
      keyId: signer.keyId,
    });
    expect(checkpoint).toMatchObject({
      algorithm: "ed25519",
      eventCount: 3,
      keyId: "e2e-checkpoint-key-1",
    });
    expect(checkpoint.signature.length).toBeGreaterThan(40);
  });
});
