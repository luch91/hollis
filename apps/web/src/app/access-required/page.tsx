import { signOut, withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

async function signOutAction() {
  "use server";
  await signOut();
}

export default async function AccessRequiredPage() {
  const { organizationId, user } = await withAuth();

  if (!user) {
    redirect("/sign-in");
  }

  if (organizationId) {
    redirect("/app");
  }

  return (
    <main>
      <section className="shell" aria-labelledby="access-title">
        <header>
          <span className="wordmark">Hollis</span>
        </header>
        <div className="content workspace">
          <p className="eyebrow">Access required</p>
          <h1 id="access-title">No organization assigned.</h1>
          <p className="summary">
            A Hollis administrator must assign your account to an organization before you can open
            the review workspace.
          </p>
          <form action={signOutAction}>
            <button className="primary-action text-button" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
