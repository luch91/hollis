import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

function hasMatchingSecret(received: string | null, expected: string | undefined) {
  if (!received || !expected) return false;
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return (
    receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes)
  );
}

export async function POST(request: Request) {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    !hasMatchingSecret(
      request.headers.get("x-hollis-e2e-runner-secret"),
      process.env.HOLLIS_E2E_RUNNER_SECRET,
    )
  ) {
    return new NextResponse(null, { status: 404 });
  }
  const apiKey = process.env.NEXT_PUBLIC_IDENTITY_PLATFORM_API_KEY;
  const email = process.env.HOLLIS_E2E_TEST_EMAIL;
  const password = process.env.HOLLIS_E2E_TEST_PASSWORD;
  if (!apiKey || !email || !password) return new NextResponse(null, { status: 404 });

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      cache: "no-store",
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  const payload = (await response.json().catch(() => null)) as { idToken?: unknown } | null;
  if (!response.ok || !payload || typeof payload.idToken !== "string") {
    return new NextResponse(null, { status: 401 });
  }
  return NextResponse.json({ identityToken: payload.idToken });
}
