# Google Cloud Identity Platform setup

Use this runbook only for the Hollis Google Cloud project `hollis-507001`.

## Configure identity methods

1. Open Google Cloud Console, select `hollis-507001`, then open Identity Platform.
2. Enable Identity Platform if it is not already enabled.
3. In Providers, enable Email/Password and require email verification.
4. Enable Google. Add `www.thehollis.xyz` and `localhost` to Authorized domains.
5. Create a GitHub OAuth application for Hollis. Its callback URL must be the callback value displayed by Identity Platform for the GitHub provider. Copy its client ID and client secret into Identity Platform, not into this repository.
6. Enable the GitHub provider in Identity Platform using that OAuth application.

## Configure the web application

In Identity Platform, open the Web SDK configuration and set these values in the local `.env` file and the Vercel Production environment:

```dotenv
NEXT_PUBLIC_IDENTITY_PLATFORM_API_KEY=...
NEXT_PUBLIC_IDENTITY_PLATFORM_AUTH_DOMAIN=...
NEXT_PUBLIC_IDENTITY_PLATFORM_PROJECT_ID=hollis-507001
IDENTITY_PLATFORM_PROJECT_ID=hollis-507001
```

The API key is a public web configuration value. It is not an authorization credential. Do not add a service-account key, OAuth client secret, session token, or user credential to `.env.example`, Git, Vercel source code, or browser-visible configuration.

## Verify before deployment

1. Build the web application with the configured values.
2. Create an email/password account and verify its email address.
3. Sign in with Google and GitHub using test accounts.
4. Confirm each new account reaches workspace onboarding, not an existing customer workspace.
5. Confirm account linking preserves the existing Hollis membership and does not grant access to another workspace.

Do not represent the identity flow as commercially production-ready until all five checks succeed and the remaining release controls in [release-readiness-2026-09-16.md](../release-readiness-2026-09-16.md) are complete.
