import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createResendTransactionalEmailService,
  TransactionalEmailDeliveryError,
} from "./transactional-email.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Resend transactional email adapter", () => {
  it("uses a stable provider idempotency key for a welcome delivery", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ id: "email_01" }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as typeof fetch;
    const service = createResendTransactionalEmailService({
      apiKey: "re_test_key_value",
      from: "Hollis <welcome@mail.thehollis.xyz>",
    });

    await expect(
      service.sendWelcome({
        deliveryId: "11111111-1111-4111-8111-111111111111",
        displayName: "Ada <Reviewer>",
        recipientEmail: "ada@example.test",
        userId: "22222222-2222-4222-8222-222222222222",
      }),
    ).resolves.toEqual({ providerMessageId: "email_01" });

    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("Resend request was not made.");
    const [url, init] = call as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({
      authorization: "Bearer re_test_key_value",
      "idempotency-key":
        "hollis/welcome/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222",
    });
    expect(init.body).toContain("Ada &lt;Reviewer&gt;");
  });

  it("does not expose a provider failure", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("invalid sender", { status: 422 }),
    ) as typeof fetch;
    const service = createResendTransactionalEmailService({
      apiKey: "re_test_key_value",
      from: "Hollis <welcome@mail.thehollis.xyz>",
    });

    await expect(
      service.sendWelcome({
        deliveryId: "11111111-1111-4111-8111-111111111111",
        displayName: null,
        recipientEmail: "ada@example.test",
        userId: "22222222-2222-4222-8222-222222222222",
      }),
    ).rejects.toBeInstanceOf(TransactionalEmailDeliveryError);
  });
});
