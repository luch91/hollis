import { authkitProxy } from "@workos-inc/authkit-nextjs";

export const proxy = authkitProxy();

export const config = {
  matcher: ["/((?!_next/static|_next/image|attestation-cases/|favicon.ico).*)"],
};
