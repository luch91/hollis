import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function api(path: string, init?: RequestInit) {
  const token = (await cookies()).get("hollis_session")?.value;
  const response = await fetch(`${apiUrl}${path}`, { cache: "no-store", ...init, headers: { authorization: `Bearer ${token ?? ""}`, "content-type": "application/json", ...init?.headers } });
  if (!response.ok) throw new Error("Workspace administration request failed.");
  return response.status === 204 ? null : response.json();
}

async function updateProfile(formData: FormData) {
  "use server";
  await api("/v1/workspace", { method: "PUT", body: JSON.stringify({ name: formData.get("name"), industry: formData.get("industry"), operatingRegion: formData.get("operatingRegion"), website: formData.get("website") }) });
  revalidatePath("/app/admin"); revalidatePath("/app", "layout");
}
async function inviteMember(formData: FormData) {
  "use server";
  const invitation = await api("/v1/workspace/invitations", { method: "POST", body: JSON.stringify({ email: formData.get("email"), role: formData.get("role") }) });
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  if (!origin && !host) throw new Error("The invitation link could not be created for this request origin.");
  const invitationUrl = `${origin ?? `${protocol}://${host}`}/invite/accept?token=${invitation.token}`;
  redirect(`/app/admin?invite=${encodeURIComponent(invitationUrl)}`);
}
async function revokeInvitation(formData: FormData) { "use server"; await api(`/v1/workspace/invitations/${formData.get("invitationId")}`, { method: "DELETE" }); revalidatePath("/app/admin"); }
async function updateMember(formData: FormData) { "use server"; await api(`/v1/workspace/members/${formData.get("userId")}`, { method: "PATCH", body: JSON.stringify({ role: formData.get("role") }) }); revalidatePath("/app/admin"); }

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const [profile, members, invitations, params] = await Promise.all([api("/v1/workspace"), api("/v1/workspace/members"), api("/v1/workspace/invitations"), searchParams]);
  return <section className="content-panel admin-workspace">
    <p className="eyebrow">Workspace controls</p><h1>Organization administration</h1><p className="page-intro">Manage the organization profile, access roles, and recipient-bound invitations.</p>
    <div className="admin-grid">
      <form action={updateProfile} className="admin-card"><h2>Organization profile</h2><label>Name<input name="name" defaultValue={profile.name} required /></label><label>Industry<input name="industry" defaultValue={profile.industry ?? ""} /></label><label>Operating region<input name="operatingRegion" defaultValue={profile.operatingRegion ?? ""} /></label><label>Website<input name="website" defaultValue={profile.website ?? ""} type="url" /></label><button className="primary-action">Save profile</button></form>
      <form action={inviteMember} className="admin-card"><h2>Invite a member</h2><p>Hollis creates a single-use invitation link. Send it only to the intended verified-email recipient.</p><label>Email<input name="email" required type="email" /></label><label>Role<select name="role" defaultValue="reviewer"><option value="reviewer">Reviewer</option><option value="contributor">Contributor</option><option value="auditor">Auditor</option><option value="administrator">Administrator</option></select></label><button className="primary-action">Create invitation link</button></form>
    </div>
    {params.invite ? <section className="admin-card invitation-link"><h2>Invitation link</h2><p>Copy this link now. It is not stored or emailed by Hollis.</p><input readOnly value={params.invite} /></section> : null}
    <section className="admin-card"><h2>Members</h2><div className="admin-list">{members.map((member: any) => <div className="admin-row" key={member.userId}><div><strong>{member.displayName || member.email}</strong><small>{member.email}</small></div><form action={updateMember}><input name="userId" type="hidden" value={member.userId} /><select aria-label={`Role for ${member.email}`} defaultValue={member.role} name="role" disabled={member.role === "owner"}><option value="administrator">Administrator</option><option value="reviewer">Reviewer</option><option value="contributor">Contributor</option><option value="auditor">Auditor</option><option value="owner">Owner</option></select><button className="text-button" disabled={member.role === "owner"}>Update role</button></form></div>)}</div></section>
    <section className="admin-card"><h2>Invitation activity</h2><div className="admin-list">{invitations.length ? invitations.map((invitation: any) => <div className="admin-row" key={invitation.id}><div><strong>{invitation.email}</strong><small>{invitation.role} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</small></div>{!invitation.acceptedAt && !invitation.revokedAt ? <form action={revokeInvitation}><input name="invitationId" type="hidden" value={invitation.id}/><button className="text-button">Revoke</button></form> : <small>{invitation.acceptedAt ? "Accepted" : "Revoked"}</small>}</div>) : <p>No invitations yet.</p>}</div></section>
  </section>;
}
