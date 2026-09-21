import { createHash } from "node:crypto";
import { canonicalJson } from "@hollis/contracts/canonical-case";

export type AuditEventForVerification = {
  actorId: string;
  createdAt: string;
  eventHash: string;
  eventSequence: number;
  eventType: string;
  payload: unknown;
  previousHash: string | null;
};

export type AuditIntegrityResult = {
  algorithm: "hollis.audit-event.v1";
  eventCount: number;
  headHash: string | null;
  status: "verified" | "failed";
  failure:
    | "duplicate_event_hash"
    | "event_hash_mismatch"
    | "invalid_genesis"
    | "non_monotonic_sequence"
    | "previous_hash_mismatch"
    | null;
};

/**
 * The event digest intentionally covers the immutable routing identity as well
 * as the event body.  Keep this representation in lockstep with the append
 * path and the standalone verifier script.
 */
export function hashAuditEvent(input: {
  actorId: string;
  caseId: string;
  eventType: string;
  occurredAt: Date | string;
  payload: unknown;
  previousHash: string | null;
  tenantId: string;
}): string {
  // Do not hash the caller's object directly: insertion order differs between
  // a write record and an exported database row. This fixed representation is
  // the V1 event-digest wire format used by the standalone verifier too.
  const canonical = {
    actorId: input.actorId,
    caseId: input.caseId,
    eventType: input.eventType,
    occurredAt:
      input.occurredAt instanceof Date ? input.occurredAt.toISOString() : input.occurredAt,
    payload: input.payload,
    previousHash: input.previousHash,
    tenantId: input.tenantId,
  };
  return `sha256:${createHash("sha256").update(canonicalJson(canonical)).digest("hex")}`;
}

export function verifyCaseAuditChain(input: {
  caseId: string;
  events: AuditEventForVerification[];
  tenantId: string;
}): AuditIntegrityResult {
  const result = (failure: AuditIntegrityResult["failure"]): AuditIntegrityResult => ({
    algorithm: "hollis.audit-event.v1",
    eventCount: input.events.length,
    failure,
    headHash: input.events.at(-1)?.eventHash ?? null,
    status: failure ? "failed" : "verified",
  });
  const eventHashes = new Set<string>();
  let previous: AuditEventForVerification | undefined;

  for (const event of input.events) {
    if (eventHashes.has(event.eventHash)) return result("duplicate_event_hash");
    eventHashes.add(event.eventHash);
    if (previous && event.eventSequence <= previous.eventSequence) {
      return result("non_monotonic_sequence");
    }
    if (!previous && event.previousHash !== null) return result("invalid_genesis");
    if (previous && event.previousHash !== previous.eventHash) {
      return result("previous_hash_mismatch");
    }
    const expected = hashAuditEvent({
      actorId: event.actorId,
      caseId: input.caseId,
      eventType: event.eventType,
      occurredAt: event.createdAt,
      payload: event.payload,
      previousHash: event.previousHash,
      tenantId: input.tenantId,
    });
    if (event.eventHash !== expected) return result("event_hash_mismatch");
    previous = event;
  }
  return result(null);
}
