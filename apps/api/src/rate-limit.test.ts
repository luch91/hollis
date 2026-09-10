import { describe, expect, it } from "vitest";
import { createInMemoryRateLimiter, RateLimitExceededError } from "./rate-limit.js";

describe("in-memory rate limiter", () => {
  const policy = { maxRequests: 2, windowMs: 60_000 };

  it("rejects the request after its scoped limit", () => {
    const limiter = createInMemoryRateLimiter();
    limiter.consume("session", "subject", policy, 1_000);
    limiter.consume("session", "subject", policy, 1_001);

    expect(() => limiter.consume("session", "subject", policy, 1_002)).toThrow(
      RateLimitExceededError,
    );
  });

  it("keeps scopes and subjects independent", () => {
    const limiter = createInMemoryRateLimiter();
    limiter.consume("session", "one", policy, 1_000);
    limiter.consume("session", "one", policy, 1_001);

    expect(() => limiter.consume("workspace", "one", policy, 1_002)).not.toThrow();
    expect(() => limiter.consume("session", "two", policy, 1_002)).not.toThrow();
  });

  it("allows requests again after the window resets", () => {
    const limiter = createInMemoryRateLimiter();
    limiter.consume("session", "subject", policy, 1_000);
    limiter.consume("session", "subject", policy, 1_001);

    expect(() => limiter.consume("session", "subject", policy, 61_000)).not.toThrow();
  });
});
