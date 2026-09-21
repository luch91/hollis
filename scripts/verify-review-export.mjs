#!/usr/bin/env node
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";

function compareUnicodeScalars(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = leftPoints[index] - rightPoints[index];
    if (difference) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new TypeError("Canonical JSON permits only safe integers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => compareUnicodeScalars(left, right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  throw new TypeError("Canonical JSON does not support this value.");
}

const [fileName] = process.argv.slice(2);
if (!fileName) {
  console.error("Usage: node scripts/verify-review-export.mjs <review-export.json>");
  process.exitCode = 64;
} else {
  const exported = JSON.parse(await readFile(fileName, "utf8"));
  const tenantId = process.env.HOLLIS_AUDIT_TENANT_ID;
  if (!tenantId) {
    console.error("Set HOLLIS_AUDIT_TENANT_ID to verify a case export.");
    process.exitCode = 64;
  } else {
    const events = exported.events;
    let previous = null;
    let failure = null;
    const seen = new Set();
    for (const event of events) {
      if (seen.has(event.eventHash)) failure = "duplicate_event_hash";
      seen.add(event.eventHash);
      if (!failure && previous === null && event.previousHash !== null) failure = "invalid_genesis";
      if (!failure && previous !== null && event.previousHash !== previous.eventHash) {
        failure = "previous_hash_mismatch";
      }
      if (!failure && previous !== null && event.eventSequence <= previous.eventSequence) {
        failure = "non_monotonic_sequence";
      }
      const expected = `sha256:${createHash("sha256")
        .update(
          canonicalJson({
            actorId: event.actorId,
            caseId: exported.case.id,
            eventType: event.eventType,
            occurredAt: event.createdAt,
            payload: event.payload,
            previousHash: event.previousHash,
            tenantId,
          }),
        )
        .digest("hex")}`;
      if (!failure && expected !== event.eventHash) failure = "event_hash_mismatch";
      previous = event;
    }
    let checkpoint = "not_present";
    if (exported.auditCheckpoint) {
      const publicKeyBase64 = process.env.HOLLIS_AUDIT_CHECKPOINT_PUBLIC_KEY_BASE64;
      if (!publicKeyBase64) {
        checkpoint = "public_key_required";
      } else {
        const publicKey = createPublicKey({
          format: "der",
          key: Buffer.from(publicKeyBase64, "base64"),
          type: "spki",
        });
        const checkpointPayload = {
          algorithm: exported.auditCheckpoint.algorithm,
          createdAt: exported.auditCheckpoint.createdAt,
          eventCount: exported.auditCheckpoint.eventCount,
          headHash: exported.auditCheckpoint.headHash,
          keyId: exported.auditCheckpoint.keyId,
        };
        const valid =
          exported.auditCheckpoint.headHash === previous?.eventHash &&
          exported.auditCheckpoint.eventCount === events.length &&
          verify(
            null,
            Buffer.from(canonicalJson(checkpointPayload), "utf8"),
            publicKey,
            Buffer.from(exported.auditCheckpoint.signature, "base64"),
          );
        checkpoint = valid ? "verified" : "failed";
        if (!valid && !failure) failure = "checkpoint_verification_failed";
      }
    }
    const result = {
      algorithm: "hollis.audit-event.v1",
      eventCount: events.length,
      failure,
      headHash: previous?.eventHash ?? null,
      checkpoint,
      status: failure ? "failed" : "verified",
    };
    console.log(JSON.stringify(result));
    if (failure) process.exitCode = 1;
  }
}
