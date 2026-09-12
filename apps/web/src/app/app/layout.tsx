import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { HollisBrand } from "../hollis-brand";
import { readHollisSession } from "@/lib/hollis-session";
import {
  revokeHollisSession,
  SessionRevocationUnavailableError,
} from "@/lib/hollis-session-revocation";
import { GlobalSearch } from "./global-search";
import { ThemeToggle } from "./theme-toggle";
import { WorkspaceNavigation } from "./workspace-navigation";
import { WorkspaceSwitcher } from "./workspace-switcher";

async function signOutAction() {
  "use server";
  const token = (await cookies()).get("hollis_session")?.value;
  try {
    await revokeHollisSession(
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
      token ?? null,
    );
  } catch (error) {
    if (error instanceof SessionRevocationUnavailableError) {
      throw new Error("Sign out could not be completed. Your session remains active.");
    }
    throw error;
  }
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
      <header className="product-rail">
        <div className="product-identity">
          <Link className="product-wordmark" href="/app" aria-label="Hollis review workspace">
            <HollisBrand />
          </Link>
          <span>
            Human oversight
            <br />
            for consequential decisions.
          </span>
        </div>
        <WorkspaceNavigation />
        <div className="workspace-account">
          <GlobalSearch />
          <ThemeToggle />
          <span aria-label="Workspace member profile" className="account-avatar" role="img">
            {workspace.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="account-role">{workspace.role}</span>
          <form action={signOutAction}>
            <button className="text-button" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <section className="application-workspace" aria-label={`${workspace.name} Hollis workspace`}>
        <header className="workspace-topbar">
          <div className="workspace-title">
            <WorkspaceSwitcher activeWorkspaceId={workspace.id} workspaceName={workspace.name} />
            <p>
              <span>/</span> Compliance Review
            </p>
          </div>
          <p className="workspace-context">Evidence, policy, human judgment, and attestation</p>
        </header>
        <div className="workspace-canvas">{children}</div>
      </section>
    </main>
  );
}
