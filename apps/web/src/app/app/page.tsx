import { signOut, withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import ReviewCasesPage from "./review-cases/page";

async function signOutAction() {
  "use server";
  await signOut();
}

export default async function ApplicationPage() {
  const { organizationId, role, user } = await withAuth({ ensureSignedIn: true });

  if (!organizationId) {
    redirect("/access-required");
  }

  return (
    <main>
      <section className="shell" aria-labelledby="workspace-title">
        <header>
          <span className="wordmark">Hollis</span>
          <form action={signOutAction}>
            <button className="text-button" type="submit">
              Sign out
            </button>
          </form>
        </header>
        <div className="identity-bar">
          <span>{user.email}</span>
          <span>{role ?? "No role assigned"}</span>
          <span>{organizationId}</span>
        </div>
        <ReviewCasesPage />
      </section>
    </main>
  );
}
