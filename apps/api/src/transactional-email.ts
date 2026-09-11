type WelcomeEmailInput = {
  deliveryId: string;
  displayName: string | null;
  recipientEmail: string;
  userId: string;
};

export type WelcomeEmailDelivery = {
  providerMessageId: string;
};

export interface TransactionalEmailService {
  sendWelcome(input: WelcomeEmailInput): Promise<WelcomeEmailDelivery>;
}

export class TransactionalEmailDeliveryError extends Error {
  constructor() {
    super("Transactional email delivery failed.");
    this.name = "TransactionalEmailDeliveryError";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function welcomeName(displayName: string | null): string {
  const value = displayName?.trim();
  return value ? escapeHtml(value) : "there";
}

export function createResendTransactionalEmailService(input: {
  apiKey: string;
  from: string;
}): TransactionalEmailService {
  return {
    async sendWelcome({ deliveryId, displayName, recipientEmail, userId }) {
      let response: Response;
      try {
        response = await fetch("https://api.resend.com/emails", {
          body: JSON.stringify({
            from: input.from,
            html: `<main><h1>Welcome to Hollis</h1><p>Hello ${welcomeName(displayName)},</p><p>Hollis gives your organization a controlled workspace for reviewing consequential automated decisions.</p><p>Sign in when you are ready to create or join a workspace.</p></main>`,
            subject: "Welcome to Hollis",
            text: `Welcome to Hollis\n\nHello ${displayName?.trim() || "there"},\n\nHollis gives your organization a controlled workspace for reviewing consequential automated decisions. Sign in when you are ready to create or join a workspace.`,
            to: [recipientEmail],
          }),
          headers: {
            authorization: `Bearer ${input.apiKey}`,
            "content-type": "application/json",
            "idempotency-key": `hollis/welcome/${deliveryId}/${userId}`,
          },
          method: "POST",
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new TransactionalEmailDeliveryError();
      }

      const payload = (await response.json().catch(() => null)) as { id?: unknown } | null;
      if (!response.ok || !payload || typeof payload.id !== "string") {
        throw new TransactionalEmailDeliveryError();
      }

      return { providerMessageId: payload.id };
    },
  };
}
