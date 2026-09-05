import { signOut, withAuth } from "@workos-inc/authkit-nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";
import { WorkspaceNavigation } from "./workspace-navigation";

async function signOutAction() {
  "use server";
  await signOut();
}

export default async function ApplicationLayout({ children }: { children: ReactNode }) {
  const { organizationId, role, user } = await withAuth();

  if (!user) redirect("/sign-in");
  if (!organizationId) redirect("/access-required");
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  return (
    <main className="application-frame">
      <aside className="product-rail" aria-label="Hollis workspace navigation">
        <Link className="product-wordmark" href="/app">
          Hollis
        </Link>
        <WorkspaceNavigation />
      </aside>
      <section className="application-workspace" aria-label="Hollis review workspace">
        <header className="workspace-topbar">
          <p>
            Compliance Review <span>/</span> Active Cases
          </p>
          <div className="workspace-account">
            <ThemeToggle />
            <span role="img" className="notification-dot" aria-label="Notifications available" />
            <span
              aria-label={`${displayName} profile picture`}
              className="account-avatar"
              role="img"
              style={
                user.profilePictureUrl
                  ? { backgroundImage: `url(${user.profilePictureUrl})` }
                  : undefined
              }
            >
              {user.profilePictureUrl ? null : displayName.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{displayName}</strong>
              <small>{role ?? "No role assigned"}</small>
            </div>
            <form action={signOutAction}>
              <button className="text-button" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <div className="workspace-canvas">{children}</div>
      </section>
    </main>
  );
}
