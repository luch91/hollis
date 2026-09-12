# Transactional email setup

Hollis uses two separate email responsibilities:

- Google Cloud Identity Platform sends email-verification messages for email-and-password accounts.
- Resend sends the one-time Hollis welcome message after a verified identity creates a new Hollis account record.

Do not use Resend for credential verification, password recovery, invitations, or inbound mail until those flows have their own approved designs.

## Approved sender

The approved verified sending subdomain is `mail.thehollis.xyz`. Configure the API sender as:

```dotenv
RESEND_FROM="Hollis <hello@mail.thehollis.xyz>"
```

Resend does not need inbound receiving enabled for this welcome-only release.

## Server configuration

1. Create a server-only Resend API key.
2. Store it in the API runtime secret store, never in browser configuration or source control.
3. Set the runtime values below together. Hollis rejects a partial configuration.

```dotenv
RESEND_API_KEY=replace-with-server-only-value
RESEND_FROM="Hollis <hello@mail.thehollis.xyz>"
```

4. Restart the API after setting the values.
5. Register a new, verified test identity and confirm exactly one welcome message appears in the Resend email activity.

The API records a delivery for a new account before it attempts provider delivery. It sends the message with a stable Resend idempotency key, so duplicate session requests do not issue duplicate welcome messages. Delivery failure does not prevent a user from establishing a Hollis session. Existing accounts are not backfilled.

## Security checks

- Do not paste the Resend API key into chat, a ticket, the browser, or a client-side environment variable.
- Do not enable click tracking for this transactional welcome message without an explicit privacy decision.
- Treat Resend delivery activity as provider operational metadata. Do not add raw policy, evidence, case, or attestation information to welcome-email content.
