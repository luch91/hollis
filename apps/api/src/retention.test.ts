import { describe, expect, it } from "vitest";
import { assertLegalHoldState, isRetentionEligible } from "./retention.js";

const now = new Date("2026-08-29T12:00:00.000Z");
const eligible = {
  caseStatus: "completed" as const,
  legalHold: "none" as const,
  retentionUntil: new Date("2026-08-29T11:59:59.000Z"),
  verified: true,
};

describe("retention policy", () => {
  it("allows deletion only for completed, verified evidence past retention", () => {
    expect(isRetentionEligible(eligible, now)).toBe(true);
  });

  it.each([
    ["pending case", { caseStatus: "pending" as const }],
    ["active legal hold", { legalHold: "active" as const }],
    ["unverified evidence", { verified: false }],
    ["missing retention date", { retentionUntil: null }],
    ["future retention date", { retentionUntil: new Date("2026-08-29T12:00:01.000Z") }],
  ])("rejects %s", (_label, override) => {
    expect(isRetentionEligible({ ...eligible, ...override }, now)).toBe(false);
  });

  it("rejects unknown legal hold states", () => {
    expect(() => assertLegalHoldState("released")).toThrow("Invalid legal hold state");
  });
});
