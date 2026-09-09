import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export default async function AcceptInvitation({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  const session = (await cookies()).get("hollis_session")?.value;
  if (!session) redirect(`/sign-in?returnTo=${encodeURIComponent(`/invite/accept?token=${token ?? ""}`)}`);
  async function accept() { "use server"; if (!token) redirect("/onboarding"); const response = await fetch(`${apiUrl}/v1/workspace-invitations/accept`, { method: "POST", headers: { authorization: `Bearer ${session}`, "content-type": "application/json" }, body: JSON.stringify({ token }) }); if (!response.ok) redirect("/invite/accept?error=unavailable"); redirect("/app"); }
  return <main className="auth-shell"><section className="auth-card"><a className="product-wordmark" href="/">Hollis</a><p className="eyebrow">Workspace invitation</p><h1>Join this workspace.</h1><p className="auth-summary">Your verified email must match the recipient of this invitation.</p>{error ? <p className="auth-error">This invitation is unavailable or belongs to a different email address.</p> : null}<form action={accept}><button className="primary-action">Accept invitation</button></form></section></main>;
}
