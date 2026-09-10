import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { readHollisSession } from "@/lib/hollis-session";
import { ThemeToggle } from "./theme-toggle";
import { WorkspaceNavigation } from "./workspace-navigation";
import { WorkspaceSwitcher } from "./workspace-switcher";

async function signOutAction() {
  "use server";
  const token = (await cookies()).get("hollis_session")?.value;
  await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/v1/auth/sessions/current`,
    {
      cache: "no-store",
      headers: {
        authorization: `Bearer ${token ?? ""}`,
      },
      method: "DELETE",
    },
  ).catch(() => undefined);
  (await cookies()).delete("hollis_session");
  redirect("/sign-in");
}

export default async function ApplicationLayout({ children }: { children: ReactNode }) {
  const current = await readHollisSession();
  if (!current) redirect("/sign-in");
  if (!current.session.activeWorkspace) redirect("/onboarding");
  const workspace = current.session.activeWorkspace;

  return (
    <main className="application-frame">
      <aside className="product-rail" aria-label="Hollis workspace navigation">
        <Link className="product-wordmark" href="/app">
          Hollis
        </Link>
        <WorkspaceNavigation />
      </aside>
      <section className="application-workspace" aria-label={`${workspace.name} Hollis workspace`}>
        <header className="workspace-topbar">
          <div className="workspace-title">
            <WorkspaceSwitcher activeWorkspaceId={workspace.id} workspaceName={workspace.name} />
            <p>
              {workspace.name} <span>/</span> Compliance Review
            </p>
          </div>
          <div className="workspace-account">
            <ThemeToggle />
            <span role="img" className="notification-dot" aria-label="Notifications available" />
            <span aria-label="Workspace member profile" className="account-avatar" role="img">
              {workspace.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>Workspace member</strong>
              <small>{workspace.role}</small>
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
