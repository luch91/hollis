import { describe, expect, it } from "vitest";
import {
  acceptInvitationSchema,
  createInvitationSchema,
  createInvitationToken,
  digestInvitationToken,
  workspaceProfileSchema,
} from "./workspace-controls.js";

describe("workspace controls", () => {
  it("creates a non-empty opaque invitation token and persists only its digest", () => {
    const token = createInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(digestInvitationToken(token)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(digestInvitationToken(token)).not.toContain(token);
  });

  it("accepts only the expected invitation token form", () => {
    expect(acceptInvitationSchema.safeParse({ token: createInvitationToken() }).success).toBe(true);
    expect(acceptInvitationSchema.safeParse({ token: "not-a-token" }).success).toBe(false);
  });

  it("rejects owner invitations and requires a valid profile", () => {
    expect(createInvitationSchema.safeParse({ email: "reviewer@example.test", role: "owner" }).success).toBe(false);
    expect(workspaceProfileSchema.safeParse({ name: "A" }).success).toBe(false);
    expect(workspaceProfileSchema.parse({ name: "Northstar Claims" }).website).toBe("");
  });
});
