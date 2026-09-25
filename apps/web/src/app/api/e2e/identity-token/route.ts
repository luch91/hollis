import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const secret = process.env.HOLLIS_E2E_RUNNER_SECRET;
  const supplied = request.headers.get("x-hollis-e2e-runner-secret");
  if (!secret || !supplied || process.env.VERCEL_ENV !== "preview")
    return new NextResponse(null, { status: 404 });
  const left = Buffer.from(supplied);
  const right = Buffer.from(secret);
  if (left.length !== right.length || !timingSafeEqual(left, right))
    return new NextResponse(null, { status: 404 });
  const apiKey = process.env.NEXT_PUBLIC_IDENTITY_PLATFORM_API_KEY;
  const email = process.env.HOLLIS_E2E_TEST_EMAIL;
  const password = process.env.HOLLIS_E2E_TEST_PASSWORD;
  if (!apiKey || !email || !password) return new NextResponse(null, { status: 404 });
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => null)) as { idToken?: unknown } | null;
  if (!response.ok || typeof payload?.idToken !== "string")
    return new NextResponse(null, { status: 401 });
  return NextResponse.json({ identityToken: payload.idToken });
}
