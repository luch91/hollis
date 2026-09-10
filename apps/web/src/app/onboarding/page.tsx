import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readHollisSession } from "@/lib/hollis-session";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function createWorkspaceAction(formData: FormData) {
  "use server";

  const name = formData.get("name");
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 120) {
    redirect("/onboarding?error=workspace-name");
  }

  const token = (await cookies()).get("hollis_session")?.value;
  if (!token) redirect("/sign-in");
  const response = await fetch(`${apiUrl}/v1/workspaces`, {
    body: JSON.stringify({ name: name.trim() }),
    cache: "no-store",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) redirect("/onboarding?error=workspace-create");
  redirect("/app");
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const current = await readHollisSession();
  if (!current) redirect("/sign-in");
  if (current.session.activeWorkspace) redirect("/app");
  const { error } = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="workspace-title">
        <a className="product-wordmark" href="/">
          Hollis
        </a>
        <p className="eyebrow">Workspace setup</p>
        <h1 id="workspace-title">Create your organization workspace.</h1>
        <p className="auth-summary">
          Your workspace is isolated from every other Hollis customer. You will become its first
          owner.
        </p>
        <form action={createWorkspaceAction} className="auth-form">
          <label>
            Organization name
            <input autoComplete="organization" defaultValue="" name="name" required />
          </label>
          {error ? (
            <p className="auth-error" role="alert">
              {error === "workspace-name"
                ? "Enter an organization name between 2 and 120 characters."
                : "Hollis could not create this workspace. Please try again."}
            </p>
          ) : null}
          <button className="primary-action" type="submit">
            Create workspace
          </button>
        </form>
        <p className="auth-switch">
          Have an invitation? Open the invitation link sent to your email.
        </p>
      </section>
    </main>
  );
}
