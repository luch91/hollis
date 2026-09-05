import type { ReviewExport } from "@hollis/contracts/review-case";
import { describe, expect, it } from "vitest";
import type { AttestationRecord } from "../../data";
import { buildDocxReport, buildMarkdownReport, buildPdfReport } from "./export-document";

const digest = `sha256:${"a".repeat(64)}`;
const hash = `sha256:${"b".repeat(64)}`;

const exported: ReviewExport = {
  case: {
    assignedAt: "2026-09-05T10:10:00.000Z",
    assignedToUserId: "reviewer-17",
    automatedSystemVersion: "decision-engine-4.2",
    createdAt: "2026-09-05T10:00:00.000Z",
    decisionOutcome: "modified",
    decisionRationale: "A human reviewer required an additional control before release.",
    decidedAt: "2026-09-05T10:20:00.000Z",
    decidedByUserId: "reviewer-17",
    evidence: [{ digest, id: "evaluation-run-418", mediaType: "application/json" }],
    externalReference: "Release review 418",
    escalatedAt: null,
    escalatedByUserId: null,
    escalationReason: null,
    finalRecommendation: "investigate",
    id: "11111111-1111-4111-8111-111111111111",
    policyVersion: "release-governance-2.1",
    recommendation: "approve",
    reviewDueAt: "2026-09-06T10:00:00.000Z",
    riskLevel: "high",
    ruleId: "independent-human-review",
    status: "completed",
  },
  events: [
    {
      actorId: "system:decision-engine-4.2",
      createdAt: "2026-09-05T10:00:00.000Z",
      eventHash: hash,
      eventSequence: 1,
      eventType: "case_created",
      payload: { source: "test" },
      previousHash: null,
    },
  ],
  manifestHash: hash,
  schemaVersion: "hollis.review-export.v1",
};

const attestations: AttestationRecord[] = [
  {
    caseCommitment: digest,
    contractAddress: "0x0000000000000000000000000000000000000001",
    createdAt: "2026-09-05T10:20:00.000Z",
    id: "22222222-2222-4222-8222-222222222222",
    provider: "genlayer",
    providerSubmissionId: "submission-418",
    publicCaseFileUrl: "https://example.org/case-418.json",
    status: "finalized",
    transactionHash: "0x1234",
    updatedAt: "2026-09-05T10:25:00.000Z",
    verdict: "pass",
  },
];

describe("case decision document exports", () => {
  const source = { attestations, exported };

  it("builds a decision-oriented Markdown record", () => {
    const result = buildMarkdownReport(source);
    expect(result).toContain("## Executive summary");
    expect(result).toContain("## Evidence inventory");
    expect(result).toContain("## Decision-use considerations");
    expect(result).toContain(exported.manifestHash);
  });

  it("builds a DOCX package", async () => {
    const result = await buildDocxReport(source);
    expect(result.byteLength).toBeGreaterThan(1_000);
    expect(result.subarray(0, 2).toString("ascii")).toBe("PK");
  });

  it("builds a PDF document", async () => {
    const result = await buildPdfReport(source);
    expect(result.byteLength).toBeGreaterThan(1_000);
    expect(new TextDecoder().decode(result.subarray(0, 5))).toBe("%PDF-");
  });
});
