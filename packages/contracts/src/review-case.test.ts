import { describe, expect, it } from "vitest";
import { createReviewCaseSchema } from "./review-case.js";

describe("createReviewCaseSchema", () => {
  it("accepts a complete review request", () => {
    const result = createReviewCaseSchema.safeParse({
      automatedSystemVersion: "claims-model-2026-08",
      evidence: [
        {
          digest: `sha256:${"a".repeat(64)}`,
          id: "evidence-001",
          mediaType: "application/pdf",
        },
      ],
      externalReference: "claim-001",
      policyVersion: "commercial-property-2026-01",
      recommendation: "deny",
      riskLevel: "high",
      ruleId: "human-review-adverse-action",
    });

    expect(result.success).toBe(true);
  });

  it("rejects evidence without a sha256 digest", () => {
    const result = createReviewCaseSchema.safeParse({
      automatedSystemVersion: "claims-model-2026-08",
      evidence: [{ digest: "unsafe", id: "evidence-001", mediaType: "application/pdf" }],
      externalReference: "claim-001",
      policyVersion: "commercial-property-2026-01",
      recommendation: "deny",
      riskLevel: "high",
      ruleId: "human-review-adverse-action",
    });

    expect(result.success).toBe(false);
  });

  it("rejects caller-controlled tenant identity", () => {
    const result = createReviewCaseSchema.safeParse({
      automatedSystemVersion: "claims-model-2026-08",
      evidence: [
        {
          digest: `sha256:${"a".repeat(64)}`,
          id: "evidence-001",
          mediaType: "application/pdf",
        },
      ],
      externalReference: "claim-001",
      policyVersion: "commercial-property-2026-01",
      recommendation: "deny",
      riskLevel: "high",
      ruleId: "human-review-adverse-action",
      tenantId: "0198ef37-6216-7000-8000-000000000001",
    });

    expect(result.success).toBe(false);
  });
});
