import { describe, expect, it } from "vitest";
import { sessionCookieMaxAgeSeconds } from "./hollis-session-cookie";

describe("Hollis session cookie lifetime", () => {
  it("uses the API session expiry as the cookie lifetime", () => {
    expect(
      sessionCookieMaxAgeSeconds(
        "2026-09-10T12:08:00.000Z",
        Date.parse("2026-09-10T12:00:00.000Z"),
      ),
    ).toBe(480);
  });

  it("rejects expired or malformed API session expiry values", () => {
    expect(() => sessionCookieMaxAgeSeconds("invalid", 0)).toThrow("expiry");
    expect(() => sessionCookieMaxAgeSeconds("1970-01-01T00:00:00.000Z", 1)).toThrow("expiry");
  });
});
