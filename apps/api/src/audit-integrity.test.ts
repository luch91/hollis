import { describe, expect, it } from "vitest";
import { hashAuditEvent, verifyCaseAuditChain } from "./audit-integrity.js";

const tenantId = "00000000-0000-4000-8000-000000000100";
const caseId = "00000000-0000-4000-8000-000000000200";

function event(
  sequence: number,
  previousHash: string | null,
  payload: unknown = { state: sequence },
) {
  const createdAt = `2026-09-21T00:00:0${sequence}.000Z`;
  return {
    actorId: "user-1",
    createdAt,
    eventHash: hashAuditEvent({
      actorId: "user-1",
      caseId,
      eventType: "review_started",
      occurredAt: createdAt,
      payload,
      previousHash,
      tenantId,
    }),
    eventSequence: sequence,
    eventType: "review_started",
    payload,
    previousHash,
  };
}

describe("verifyCaseAuditChain", () => {
  it("accepts a linear, correctly hashed chain", () => {
    const first = event(1, null);
    const second = event(2, first.eventHash);
    expect(verifyCaseAuditChain({ caseId, events: [first, second], tenantId })).toMatchObject({
      eventCount: 2,
      headHash: second.eventHash,
      status: "verified",
    });
  });

  it("uses the same digest for write-time Date values and exported ISO timestamps", () => {
    const occurredAt = "2026-09-21T00:00:01.000Z";
    const input = {
      actorId: "user-1",
      caseId,
      eventType: "review_started",
      payload: { assignedToUserId: "user-1" },
      previousHash: null,
      tenantId,
    };
    expect(hashAuditEvent({ ...input, occurredAt: new Date(occurredAt) })).toBe(
      hashAuditEvent({ ...input, occurredAt }),
    );
  });

  it.each([
    [
      "altered",
      (_first: ReturnType<typeof event>, second: ReturnType<typeof event>) => ({
        ...second,
        payload: { state: 99 },
      }),
      "event_hash_mismatch",
    ],
    [
      "reordered",
      (first: ReturnType<typeof event>, second: ReturnType<typeof event>) => [second, first],
      "invalid_genesis",
    ],
    [
      "forked",
      (first: ReturnType<typeof event>, second: ReturnType<typeof event>) => [
        first,
        second,
        { ...second, eventHash: `${second.eventHash}a`, eventSequence: 3 },
      ],
      "previous_hash_mismatch",
    ],
  ] as const)("rejects %s chains", (_name, mutate, failure) => {
    const first = event(1, null);
    const second = event(2, first.eventHash);
    const candidate = mutate(first, second);
    const events = Array.isArray(candidate) ? candidate : [first, candidate];
    expect(verifyCaseAuditChain({ caseId, events, tenantId }).failure).toBe(failure);
  });
});
