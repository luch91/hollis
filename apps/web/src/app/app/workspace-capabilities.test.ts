import { describe, expect, it } from "vitest";
import {
  canCreateReviewCases,
  canManageAttestations,
  canPerformHumanReview,
} from "./workspace-capabilities";

describe("workspace capabilities", () => {
  it.each(["owner", "administrator", "reviewer", "contributor"])(
    "allows %s to create review cases",
    (role) => expect(canCreateReviewCases(role)).toBe(true),
  );

  it("keeps auditors and unknown roles out of case intake", () => {
    expect(canCreateReviewCases("auditor")).toBe(false);
    expect(canCreateReviewCases("unknown")).toBe(false);
  });

  it.each(["owner", "administrator", "reviewer"])(
    "allows %s to perform human review and attestation actions",
    (role) => {
      expect(canPerformHumanReview(role)).toBe(true);
      expect(canManageAttestations(role)).toBe(true);
    },
  );

  it.each(["auditor", "contributor", "unknown"])(
    "keeps %s out of human review and attestation actions",
    (role) => {
      expect(canPerformHumanReview(role)).toBe(false);
      expect(canManageAttestations(role)).toBe(false);
    },
  );
});
