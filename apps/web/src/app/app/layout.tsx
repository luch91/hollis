import { cookies } from "next/headers";
import Image from "next/image";
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
import { GuidedTour } from "./guided-tour";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function readOrganizationLogoUrl(): Promise<string | null> {
  const token = (await cookies()).get("hollis_session")?.value;
  if (!token) return null;

  try {
    const response = await fetch(`${apiUrl}/v1/workspace`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const profile = (await response.json()) as { logoUrl?: unknown } | null;
    if (!profile || typeof profile.logoUrl !== "string") return null;
    return new URL(profile.logoUrl).protocol === "https:" ? profile.logoUrl : null;
  } catch {
    return null;
  }
}

async function readProfileHeader(): Promise<{
  avatarUrl: string | null;
  displayName: string | null;
}> {
  const token = (await cookies()).get("hollis_session")?.value;
  if (!token) return { avatarUrl: null, displayName: null };

  try {
    const response = await fetch(`${apiUrl}/v1/profile`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) return { avatarUrl: null, displayName: null };
    const profile = (await response.json()) as {
      avatarUrl?: unknown;
      displayName?: unknown;
    } | null;
    return {
      avatarUrl:
        profile &&
        typeof profile.avatarUrl === "string" &&
        new URL(profile.avatarUrl).protocol === "https:"
          ? profile.avatarUrl
          : null,
      displayName: profile && typeof profile.displayName === "string" ? profile.displayName : null,
    };
  } catch {
    return { avatarUrl: null, displayName: null };
  }
}

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
  const [logoUrl, profile] = await Promise.all([readOrganizationLogoUrl(), readProfileHeader()]);
  const avatarInitial = (profile.displayName || workspace.name).slice(0, 1).toUpperCase();

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
          <Link
            aria-label="Open your profile"
            className="account-avatar account-avatar-link"
            href="/app/profile"
          >
            {profile.avatarUrl ? (
              <Image alt="Your profile" fill sizes="32px" src={profile.avatarUrl} unoptimized />
            ) : (
              avatarInitial
            )}
          </Link>
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
            {logoUrl ? (
              <Image
                alt={`${workspace.name} logo`}
                className="workspace-organization-logo"
                height={28}
                src={logoUrl}
                unoptimized
                width={28}
              />
            ) : null}
            <WorkspaceSwitcher activeWorkspaceId={workspace.id} workspaceName={workspace.name} />
          </div>
          <p className="workspace-context">Evidence, policy, human judgment, and attestation</p>
        </header>
        <div className="workspace-canvas">{children}</div>
      </section>
      <GuidedTour />
    </main>
  );
}
