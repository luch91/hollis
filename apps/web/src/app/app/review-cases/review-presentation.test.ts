import { describe, expect, it } from "vitest";
import { caseUrgency, dueBucket, matchesReviewSearch, riskRow } from "./review-presentation";

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

  it("searches case, source, and recommendation without case sensitivity", () => {
    const reviewCase = {
      externalReference: "Gaymused Access Review",
      hollisCaseReference: "HL-26-7M4K-P9Q2",
      recommendation: "investigate" as const,
    };
    expect(matchesReviewSearch(reviewCase, "7m4k")).toBe(true);
    expect(matchesReviewSearch(reviewCase, "ACCESS")).toBe(true);
    expect(matchesReviewSearch(reviewCase, "investigate")).toBe(true);
    expect(matchesReviewSearch(reviewCase, "unrelated")).toBe(false);
  });
});
