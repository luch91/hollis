import { describe, expect, it } from "vitest";
import {
  createProfileAvatar,
  ProfileAvatarError,
  serializeProfileTimestamp,
  updateUserProfileSchema,
} from "./user-profile.js";

describe("personal profile boundaries", () => {
  it("builds a tenant-scoped object name from verified PNG content", () => {
    const avatar = createProfileAvatar(
      "0198ef37-6216-7000-8000-000000000001",
      "0198ef37-6216-7000-8000-000000000002",
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]),
      "image/png",
    );
    expect(avatar.objectName).toMatch(
      /^tenants\/0198ef37-6216-7000-8000-000000000001\/user-profiles\/0198ef37-6216-7000-8000-000000000002\/[a-f0-9]{64}$/,
    );
    expect(avatar.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects a claimed image type that does not match the uploaded bytes", () => {
    expect(() =>
      createProfileAvatar("tenant", "user", Buffer.from("not-an-image"), "image/png"),
    ).toThrow(ProfileAvatarError);
  });

  it("accepts only a valid named time zone", () => {
    expect(
      updateUserProfileSchema.safeParse({ displayName: "Jordan Blake", timeZone: "Africa/Lagos" })
        .success,
    ).toBe(true);
    expect(
      updateUserProfileSchema.safeParse({ displayName: "Jordan Blake", timeZone: "Not/AZone" })
        .success,
    ).toBe(false);
  });

  it("serializes timestamps from either supported database representation", () => {
    expect(serializeProfileTimestamp("2026-09-15T20:00:00.000Z")).toBe("2026-09-15T20:00:00.000Z");
    expect(serializeProfileTimestamp(new Date("2026-09-15T20:00:00.000Z"))).toBe(
      "2026-09-15T20:00:00.000Z",
    );
    expect(serializeProfileTimestamp(null)).toBeNull();
  });
});
