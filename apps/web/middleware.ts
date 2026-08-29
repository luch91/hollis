import { authkitProxy } from "@workos-inc/authkit-nextjs";

export default authkitProxy({
  // Route-level withAuth({ ensureSignedIn: true }) calls enforce authentication.
  // Keep middleware focused on session refresh so AuthKit does not require a
  // middleware marker header on every server-rendered route.
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
