import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { InvitationLink } from "./invitation-link";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const industries = [
  ["financial-services", "Financial services"],
  ["insurance", "Insurance"],
  ["healthcare", "Healthcare"],
  ["legal-services", "Legal services"],
  ["public-sector", "Public sector"],
  ["technology", "Technology"],
  ["retail", "Retail"],
  ["manufacturing", "Manufacturing"],
  ["education", "Education"],
  ["telecommunications", "Telecommunications"],
  ["energy-and-utilities", "Energy and utilities"],
  ["transport-and-logistics", "Transport and logistics"],
  ["professional-services", "Professional services"],
  ["nonprofit", "Nonprofit"],
  ["other", "Other"],
] as const;

const operatingRegions = [
  ["africa", "Africa"],
  ["asia-pacific", "Asia Pacific"],
  ["europe", "Europe"],
  ["latin-america", "Latin America"],
  ["middle-east", "Middle East"],
  ["north-america", "North America"],
  ["global", "Global"],
  ["other", "Other"],
] as const;

type WorkspaceProfile = {
  industry: string | null;
  name: string;
  operatingRegion: string | null;
  website: string | null;
};

type WorkspaceMember = {
  avatarUrl: string | null;
  displayName: string | null;
  email: string | null;
  role: string;
  userId: string;
};

type WorkspaceInvitation = {
  acceptedAt: string | null;
  email: string;
  expiresAt: string;
  id: string;
  revokedAt: string | null;
  role: string;
};

type WorkspaceAuditEvent = {
  createdAt: string;
  eventHash: string;
  eventSequence: number;
  eventType: string;
};

class WorkspaceAdministrationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
  ) {
    super(
      `Workspace administration request failed (status=${status}${code ? ` code=${code}` : ""}).`,
    );
    this.name = "WorkspaceAdministrationError";
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = (await cookies()).get("hollis_session")?.value;
  const response = await fetch(`${apiUrl}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      authorization: `Bearer ${token ?? ""}`,
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  if (response.status === 401) redirect("/sign-in");
  if (response.status === 403) redirect("/access-required");
  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as { code?: string } | null;
    throw new WorkspaceAdministrationError(response.status, failure?.code ?? null);
  }
  return (response.status === 204 ? null : await response.json()) as T;
}

async function updateProfile(formData: FormData) {
  "use server";
  await api("/v1/workspace", {
    method: "PUT",
    body: JSON.stringify({
      name: formData.get("name"),
      industry: formData.get("industry"),
      operatingRegion: formData.get("operatingRegion"),
      website: formData.get("website"),
    }),
  });
  revalidatePath("/app/admin");
  revalidatePath("/app", "layout");
}
async function inviteMember(formData: FormData) {
  "use server";
  const invitation = await api<{ token: string }>("/v1/workspace/invitations", {
    method: "POST",
    body: JSON.stringify({ email: formData.get("email"), role: formData.get("role") }),
  });
  (await cookies()).set("hollis_invitation_token", invitation.token, {
    httpOnly: true,
    maxAge: 5 * 60,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
  redirect("/app/admin?invite=ready");
}
async function revokeInvitation(formData: FormData) {
  "use server";
  await api(`/v1/workspace/invitations/${formData.get("invitationId")}`, { method: "DELETE" });
  revalidatePath("/app/admin");
}
async function updateMember(formData: FormData) {
  "use server";
  await api(`/v1/workspace/members/${formData.get("userId")}`, {
    method: "PATCH",
    body: JSON.stringify({ role: formData.get("role") }),
  });
  revalidatePath("/app/admin");
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const [profile, members, invitations, auditEvents, params] = await Promise.all([
    api<WorkspaceProfile>("/v1/workspace"),
    api<WorkspaceMember[]>("/v1/workspace/members"),
    api<WorkspaceInvitation[]>("/v1/workspace/invitations"),
    api<WorkspaceAuditEvent[]>("/v1/workspace/audit-events"),
    searchParams,
  ]);
  return (
    <section className="content-panel admin-workspace">
      <p className="eyebrow">Workspace controls</p>
      <h1>Organization administration</h1>
      <p className="page-intro">
        Manage the organization profile, access roles, and recipient-bound invitations.
      </p>
      <div className="admin-grid">
        <form action={updateProfile} className="admin-card">
          <h2>Organization profile</h2>
          <label>
            Name
            <input name="name" defaultValue={profile.name} required />
          </label>
          <label>
            Industry
            <select defaultValue={profile.industry ?? ""} name="industry">
              <option value="">Select an industry</option>
              {profile.industry && !industries.some(([value]) => value === profile.industry) ? (
                <option value={profile.industry}>{profile.industry}</option>
              ) : null}
              {industries.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Operating region
            <select defaultValue={profile.operatingRegion ?? ""} name="operatingRegion">
              <option value="">Select an operating region</option>
              {profile.operatingRegion &&
              !operatingRegions.some(([value]) => value === profile.operatingRegion) ? (
                <option value={profile.operatingRegion}>{profile.operatingRegion}</option>
              ) : null}
              {operatingRegions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Website
            <input name="website" defaultValue={profile.website ?? ""} type="url" />
          </label>
          <button className="primary-action" type="submit">
            Save profile
          </button>
        </form>
        <form action={inviteMember} className="admin-card">
          <h2>Invite a member</h2>
          <p>
            Hollis creates a single-use invitation link. Send it only to the intended verified-email
            recipient.
          </p>
          <label>
            Email
            <input name="email" required type="email" />
          </label>
          <label>
            Role
            <select name="role" defaultValue="reviewer">
              <option value="reviewer">Reviewer</option>
              <option value="contributor">Contributor</option>
              <option value="auditor">Auditor</option>
              <option value="administrator">Administrator</option>
            </select>
          </label>
          <button className="primary-action" type="submit">
            Create invitation link
          </button>
        </form>
      </div>
      {params.invite === "ready" ? (
        <section className="admin-card invitation-link">
          <h2>Invitation link</h2>
          <InvitationLink />
        </section>
      ) : null}
      <section className="admin-card">
        <h2>Members</h2>
        <div className="admin-list">
          {members.map((member) => (
            <div className="admin-row" key={member.userId}>
              <div>
                <strong>{member.displayName || member.email}</strong>
                <small>{member.email}</small>
              </div>
              <form action={updateMember}>
                <input name="userId" type="hidden" value={member.userId} />
                <select
                  aria-label={`Role for ${member.email}`}
                  defaultValue={member.role}
                  name="role"
                  disabled={member.role === "owner"}
                >
                  <option value="administrator">Administrator</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="contributor">Contributor</option>
                  <option value="auditor">Auditor</option>
                  <option value="owner">Owner</option>
                </select>
                <button className="text-button" disabled={member.role === "owner"} type="submit">
                  Update role
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>
      <section className="admin-card">
        <h2>Invitation activity</h2>
        <div className="admin-list">
          {invitations.length ? (
            invitations.map((invitation) => (
              <div className="admin-row" key={invitation.id}>
                <div>
                  <strong>{invitation.email}</strong>
                  <small>
                    {invitation.role} · expires{" "}
                    {new Date(invitation.expiresAt).toLocaleDateString()}
                  </small>
                </div>
                {!invitation.acceptedAt && !invitation.revokedAt ? (
                  <form action={revokeInvitation}>
                    <input name="invitationId" type="hidden" value={invitation.id} />
                    <button className="text-button" type="submit">
                      Revoke
                    </button>
                  </form>
                ) : (
                  <small>{invitation.acceptedAt ? "Accepted" : "Revoked"}</small>
                )}
              </div>
            ))
          ) : (
            <p>No invitations yet.</p>
          )}
        </div>
      </section>
      <section className="admin-card">
        <h2>Control history</h2>
        <p>Workspace changes are recorded in an append-only hash chain.</p>
        <div className="admin-list">
          {auditEvents.length ? (
            auditEvents.map((event) => (
              <div className="admin-row" key={`${event.eventSequence}-${event.eventHash}`}>
                <div>
                  <strong>{event.eventType.replaceAll("_", " ")}</strong>
                  <small>
                    {new Date(event.createdAt).toLocaleString()} · {event.eventHash.slice(0, 20)}…
                  </small>
                </div>
                <small>#{event.eventSequence}</small>
              </div>
            ))
          ) : (
            <p>No workspace control events yet.</p>
          )}
        </div>
      </section>
    </section>
  );
}
