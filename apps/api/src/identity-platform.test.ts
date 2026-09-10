import { describe, expect, it } from "vitest";
import { requiredIdentityPlatformTokenClaims } from "./identity-platform.js";

describe("Identity Platform token verification policy", () => {
  it("requires an expiration claim", () => {
    expect(requiredIdentityPlatformTokenClaims).toContain("exp");
  });
});
