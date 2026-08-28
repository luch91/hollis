import { signOut, withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

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
        <div className="content workspace">
          <p className="eyebrow">Review workspace</p>
          <h1 id="workspace-title">Control room</h1>
          <p className="summary">
            Authentication is active. Review operations remain closed until authorization and tenant
            data access are connected.
          </p>
          <dl>
            <div>
              <dt>User</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Organization</dt>
              <dd>{organizationId}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{role ?? "No role assigned"}</dd>
            </div>
          </dl>
        </div>
      </section>
    </main>
  );
}
