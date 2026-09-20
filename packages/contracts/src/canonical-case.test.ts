import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalCaseRecordSchema, canonicalJson } from "./canonical-case.js";
import {
  computeCaseCommitment,
  hashCanonicalValue,
  verifyCanonicalReviewMetadata,
} from "./canonical-case-node.js";

type Vector = {
  canonicalJson: string;
  caseCommitment: string;
  record: unknown;
};

const vectorPath = fileURLToPath(
  new URL("../../../contracts/canonical/test-vectors/canonical-case-v1.json", import.meta.url),
);
const vector = JSON.parse(readFileSync(vectorPath, "utf8")) as Vector;

describe("canonical case commitments", () => {
  it("matches the language-neutral test vector", () => {
    const record = canonicalCaseRecordSchema.parse(vector.record);
    expect(canonicalJson(record)).toBe(vector.canonicalJson);
    expect(computeCaseCommitment(record)).toBe(vector.caseCommitment);
  });

  it("sorts object keys but preserves array order", () => {
    expect(canonicalJson({ z: 1, a: ["first", "second"] })).toBe('{"a":["first","second"],"z":1}');
    expect(canonicalJson({ a: ["second", "first"], z: 1 })).not.toBe(
      canonicalJson({ z: 1, a: ["first", "second"] }),
    );
  });

  it("sorts non-ASCII keys by Unicode scalar value without locale dependence", () => {
    expect(canonicalJson({ "😀": 3, é: 2, z: 1 })).toBe('{"z":1,"é":2,"😀":3}');
  });

  it("domain-separates equal values", () => {
    expect(hashCanonicalValue("hollis.one.v1", { value: "same" })).not.toBe(
      hashCanonicalValue("hollis.two.v1", { value: "same" }),
    );
  });

  it("binds the schema version and rejects an unsupported version", () => {
    const changed = { ...(vector.record as Record<string, unknown>), schemaVersion: "v2" };
    expect(hashCanonicalValue("hollis.case-commitment.v1", changed)).not.toBe(
      vector.caseCommitment,
    );
    expect(() => canonicalCaseRecordSchema.parse(changed)).toThrow();
  });

  it.each([
    ["audit manifest", ["auditManifestHash"], `sha256:${"1".repeat(64)}`],
    ["case identity", ["caseIdentityCommitment"], `sha256:${"2".repeat(64)}`],
    ["evidence digest", ["evidence", 0, "digest"], `sha256:${"3".repeat(64)}`],
    ["evidence media type", ["evidence", 0, "mediaType"], "text/plain"],
    ["evidence verification", ["evidence", 0, "verified"], false],
    ["policy id", ["policy", "policyId"], "appeals"],
    ["policy version", ["policy", "policyVersion"], "2026.2"],
    ["control id", ["policy", "controlId"], "second-review"],
    ["control version", ["policy", "controlVersion"], "2.0"],
    ["policy digest", ["policy", "policyDocumentDigest"], `sha256:${"4".repeat(64)}`],
    ["private facts", ["privateReviewFactsCommitment"], `sha256:${"5".repeat(64)}`],
    ["escalation", ["review", "escalationRecorded"], true],
    ["decision outcome", ["review", "humanDecisionOutcome"], "rejected"],
    ["reviewer action", ["review", "reviewerActionCommitment"], `sha256:${"6".repeat(64)}`],
  ])("changes when the bound %s changes", (_label, path, replacement) => {
    const changed = structuredClone(vector.record) as Record<string, unknown>;
    let target: Record<string | number, unknown> | unknown[] = changed;
    for (const segment of path.slice(0, -1)) {
      target = target[segment as keyof typeof target] as Record<string | number, unknown>;
    }
    target[path.at(-1) as keyof typeof target] = replacement;
    expect(computeCaseCommitment(canonicalCaseRecordSchema.parse(changed))).not.toBe(
      vector.caseCommitment,
    );
  });

  it("rejects a structurally valid record paired with the wrong commitment", () => {
    expect(() =>
      verifyCanonicalReviewMetadata({
        caseCommitment: `sha256:${"0".repeat(64)}`,
        commitmentVersion: "hollis.case-commitment.v1",
        record: vector.record,
      }),
    ).toThrow("does not match");
  });

  it("rejects a canonical completed record without a recorded decision", () => {
    const changed = structuredClone(vector.record) as {
      review: { decisionRecorded: boolean };
    };
    changed.review.decisionRecorded = false;
    expect(() => canonicalCaseRecordSchema.parse(changed)).toThrow("expected true");
  });

  it("rejects non-integer and unsupported values", () => {
    expect(() => canonicalJson({ value: 1.5 })).toThrow("safe integer");
    expect(() => canonicalJson({ value: undefined })).toThrow("undefined");
    expect(() => canonicalJson(Symbol("unsupported"))).toThrow("does not support");
  });
});
