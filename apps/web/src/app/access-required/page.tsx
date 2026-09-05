import { signOut, switchToOrganization, withAuth } from "@workos-inc/authkit-nextjs";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function signOutAction() {
  "use server";
  await signOut();
}

async function createWorkspaceAction(formData: FormData) {
  "use server";

  const { accessToken, organizationId, sessionId, user } = await withAuth({ ensureSignedIn: true });
  if (!user || !accessToken) redirect("/sign-in");
  if (organizationId) redirect("/app");

  const name = formData.get("workspaceName");
  if (typeof name !== "string") throw new Error("Enter a workspace name.");
  const idempotencyKey = createHash("sha256")
    .update(`${sessionId}\u0000${name.trim()}`)
    .digest("hex");

  const response = await fetch(`${apiUrl}/v1/workspaces`, {
    body: JSON.stringify({ name }),
    cache: "no-store",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "idempotency-key": `workspace:${idempotencyKey}`,
    },
    method: "POST",
  });
  if (!response.ok) throw new Error("Workspace creation could not be completed.");

  const workspace = (await response.json()) as { organizationId: string };
  await switchToOrganization(workspace.organizationId);
  redirect("/app");
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
          <h1 id="access-title">Create your Hollis workspace.</h1>
          <p className="summary">
            Set up a workspace for your organization, or ask a workspace administrator to invite
            you. Creating a workspace makes you its first administrator.
          </p>
          <form action={createWorkspaceAction} className="workspace-setup">
            <label htmlFor="workspaceName">Workspace name</label>
            <input
              id="workspaceName"
              name="workspaceName"
              autoComplete="organization"
              maxLength={120}
              minLength={2}
              required
            />
            <button className="primary-action" type="submit">
              Create workspace
            </button>
          </form>
          <p className="workspace-note">
            Invitations, verified-domain join rules, and directory sync remain controlled by the
            workspace administrator.
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
