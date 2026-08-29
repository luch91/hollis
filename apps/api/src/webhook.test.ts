import { describe, expect, it } from "vitest";
import {
  claimsWebhookSchema,
  InvalidWebhookError,
  signClaimsWebhook,
  verifyClaimsWebhook,
} from "./webhook.js";

const payload = claimsWebhookSchema.parse({
  automatedSystemVersion: "claims-model-2026-08",
  evidence: [
    { digest: `sha256:${"a".repeat(64)}`, id: "evidence-001", mediaType: "application/pdf" },
  ],
  externalReference: "claim-001",
  organizationId: "org_01",
  policyVersion: "commercial-property-2026-01",
  recommendation: "deny",
  riskLevel: "high",
  reviewDueAt: "2026-08-29T08:00:00.000Z",
  ruleId: "human-review-adverse-action",
});

describe("claims webhook authentication", () => {
  it("verifies a signed canonical payload and matching idempotency key", () => {
    const timestamp = 1_740_000_000;
    const secret = "s".repeat(32);
    expect(
      verifyClaimsWebhook(
        payload,
        {
          idempotencyKey: payload.externalReference,
          signature: signClaimsWebhook(payload, timestamp, secret),
          timestamp: String(timestamp),
        },
        secret,
        timestamp * 1000,
      ),
    ).toEqual(payload);
  });

  it("rejects stale, mismatched, and replay-unsafe envelopes", () => {
    const secret = "s".repeat(32);
    const timestamp = 1_740_000_000;
    expect(() =>
      verifyClaimsWebhook(
        payload,
        { idempotencyKey: "other", signature: "sha256=bad", timestamp: String(timestamp) },
        secret,
        timestamp * 1000,
      ),
    ).toThrow(InvalidWebhookError);
    expect(() =>
      verifyClaimsWebhook(
        payload,
        {
          idempotencyKey: payload.externalReference,
          signature: signClaimsWebhook(payload, timestamp, secret),
          timestamp: String(timestamp),
        },
        secret,
        (timestamp + 301) * 1000,
      ),
    ).toThrow(InvalidWebhookError);
  });
});
