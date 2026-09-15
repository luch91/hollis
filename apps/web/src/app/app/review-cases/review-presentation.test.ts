import { describe, expect, it } from "vitest";
import {
  caseUrgency,
  dueBucket,
  keyEvidenceRecords,
  orderHorizonCases,
  presentAssignee,
  riskRow,
} from "./review-presentation";

const now = new Date("2026-09-11T12:00:00.000Z");

describe("review presentation", () => {
  it("groups review deadlines into stable operational windows", () => {
    expect(dueBucket("2026-09-11T11:59:59.000Z", now)).toBe("overdue");
    expect(dueBucket("2026-09-12T12:00:00.000Z", now)).toBe("today");
    expect(dueBucket("2026-09-18T12:00:00.000Z", now)).toBe("soon");
    expect(dueBucket("2026-09-18T12:00:01.000Z", now)).toBe("later");
    expect(dueBucket(null, now)).toBe("later");
  });

  it("keeps critical and high risk separate from the standard row", () => {
    expect(riskRow("critical")).toBe("critical");
    expect(riskRow("high")).toBe("high");
    expect(riskRow("medium")).toBe("standard");
    expect(riskRow("low")).toBe("standard");
  });

  it("prioritizes deadline before risk within the same horizon", () => {
    const overdueLow = caseUrgency(
      { reviewDueAt: "2026-09-11T11:00:00.000Z", riskLevel: "low" },
      now,
    );
    const futureCritical = caseUrgency(
      { reviewDueAt: "2026-09-12T11:00:00.000Z", riskLevel: "critical" },
      now,
    );
    expect(overdueLow).toBeLessThan(futureCritical);
  });

  it("keeps active cases ahead of completed records in the priority map", () => {
    expect(
      orderHorizonCases([
        { id: "closed", status: "completed" },
        { id: "open", status: "pending" },
        { id: "review", status: "in_review" },
      ]).map((reviewCase) => reviewCase.id),
    ).toEqual(["open", "review", "closed"]);
  });

  it("assigns deterministic unique keys to repeated evidence references", () => {
    const evidence = [
      { digest: "sha256:abc", id: "decision-record.txt" },
      { digest: "sha256:abc", id: "decision-record.txt" },
    ];

    expect(keyEvidenceRecords(evidence).map(({ key }) => key)).toEqual([
      "decision-record.txt:sha256:abc:0",
      "decision-record.txt:sha256:abc:1",
    ]);
  });

  it("presents an assigned workspace member without exposing the internal identifier", () => {
    expect(
      presentAssignee("0198ef37-6216-7000-8000-000000000010", {
        displayName: "Jordan Blake",
        email: "jordan.blake@example.test",
        role: "reviewer",
      }),
    ).toEqual({
      meta: "reviewer · jordan.blake@example.test",
      name: "Jordan Blake",
    });
  });

  it("uses safe labels for an unassigned case and an unavailable former member", () => {
    expect(presentAssignee(null, null)).toEqual({ meta: null, name: "Unassigned" });
    expect(presentAssignee("0198ef37-6216-7000-8000-000000000010", null)).toEqual({
      meta: null,
      name: "Unknown former member",
    });
  });
});
