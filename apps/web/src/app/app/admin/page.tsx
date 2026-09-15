import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readHollisSession } from "@/lib/hollis-session";
import { InvitationLink } from "./invitation-link";
import { OrganizationLogoControl } from "./organization-logo-control";
import { createWorkspaceRequestHeaders } from "./request-headers";

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

function optionLabel(options: ReadonlyArray<readonly [string, string]>, value: string | null) {
  if (!value) return "Not specified";
  return options.find(([option]) => option === value)?.[1] ?? value;
}

type WorkspaceProfile = {
  industry: string | null;
  logoUrl: string | null;
  name: string;
  operatingRegion: string | null;
  website: string | null;
};

type WorkspaceMember = {
  avatarUrl: string | null;
  displayName: string | null;
  email: string | null;
  isCurrentUser: boolean;
  role: string;
  userId: string | null;
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
    headers: createWorkspaceRequestHeaders(token, init),
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
  const website = String(formData.get("website") ?? "").trim();
  await api("/v1/workspace", {
    method: "PUT",
    body: JSON.stringify({
      name: formData.get("name"),
      industry: formData.get("industry"),
      operatingRegion: formData.get("operatingRegion"),
      website: website && !/^https?:\/\//i.test(website) ? `https://${website}` : website,
    }),
  });
  revalidatePath("/app/admin");
  revalidatePath("/app", "layout");
  redirect("/app/admin?profile=updated");
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
  searchParams: Promise<{ edit?: string; invite?: string; logo?: string; profile?: string }>;
}) {
  const session = await readHollisSession();
  if (!session?.session.activeWorkspace) redirect("/onboarding");
  const role = session.session.activeWorkspace.role;
  const canManage = role === "owner" || role === "administrator";
  const isOwner = role === "owner";
  const [profile, members, invitations, auditEvents, params] = await Promise.all([
    api<WorkspaceProfile>("/v1/workspace"),
    api<WorkspaceMember[]>("/v1/workspace/members"),
    canManage ? api<WorkspaceInvitation[]>("/v1/workspace/invitations") : Promise.resolve([]),
    canManage ? api<WorkspaceAuditEvent[]>("/v1/workspace/audit-events") : Promise.resolve([]),
    searchParams,
  ]);
  return (
    <section className="content-panel admin-workspace">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">Workspace controls</p>
          <h1>Organization administration</h1>
          <p>
            {canManage
              ? "Manage the organization profile, access roles, and recipient-bound invitations."
              : "Review the organization profile and member directory."}
          </p>
        </div>
        <aside className="organization-identity" aria-label={`${profile.name} identity`}>
          {profile.logoUrl ? (
            <Image
              alt={`${profile.name} logo`}
              height={42}
              src={profile.logoUrl}
              unoptimized
              width={42}
            />
          ) : (
            <span aria-hidden="true">{profile.name.slice(0, 1).toUpperCase()}</span>
          )}
          <div>
            <strong>{profile.name}</strong>
            <small>Managed organization media</small>
          </div>
        </aside>
      </header>
      {!canManage ? (
        <aside className="admin-access-notice" aria-label="Workspace access level">
          <div>
            <span>Read-only access</span>
            <strong>Workspace information is available without administrative controls.</strong>
          </div>
          <small>{role.replaceAll("_", " ")}</small>
        </aside>
      ) : null}
      {canManage && params.profile === "updated" ? (
        <aside className="admin-success-notice" aria-live="polite">
          Organization profile saved.
        </aside>
      ) : null}
      {canManage && params.logo === "updated" ? (
        <aside className="admin-success-notice" aria-live="polite">
          Organization logo imported and saved.
        </aside>
      ) : null}
      {canManage && params.logo === "removed" ? (
        <aside className="admin-success-notice" aria-live="polite">
          Organization logo removed.
        </aside>
      ) : null}
      {canManage && (params.logo === "import-failed" || params.logo === "remove-failed") ? (
        <aside className="admin-error-notice" role="alert">
          Organization logo could not be updated. Try again from the saved HTTPS website.
        </aside>
      ) : null}
      {canManage ? (
        <OrganizationLogoControl logoUrl={profile.logoUrl} organizationName={profile.name} />
      ) : null}
      <div className="admin-grid">
        {canManage && params.edit === "profile" ? (
          <form action={updateProfile} className="admin-card">
            <div className="admin-card-heading">
              <div>
                <p className="eyebrow">Editing</p>
                <h2>Organization profile</h2>
              </div>
              <Link className="text-button" href="/app/admin">
                Cancel
              </Link>
            </div>
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
              <input
                autoComplete="url"
                inputMode="url"
                name="website"
                defaultValue={profile.website ?? ""}
                placeholder="example.com"
                type="text"
              />
            </label>
            <button className="primary-action" type="submit">
              Save changes
            </button>
          </form>
        ) : (
          <section className="admin-card admin-profile-readonly admin-profile-summary">
            <div className="admin-card-heading">
              <div>
                <p className="eyebrow">Current profile</p>
                <h2>Organization profile</h2>
              </div>
              {canManage ? (
                <Link className="secondary-action" href="/app/admin?edit=profile">
                  Edit profile
                </Link>
              ) : null}
            </div>
            <dl>
              <div>
                <dt>Name</dt>
                <dd>{profile.name}</dd>
              </div>
              <div>
                <dt>Industry</dt>
                <dd>{optionLabel(industries, profile.industry)}</dd>
              </div>
              <div>
                <dt>Operating region</dt>
                <dd>{optionLabel(operatingRegions, profile.operatingRegion)}</dd>
              </div>
              <div>
                <dt>Website</dt>
                <dd>{profile.website || "Not specified"}</dd>
              </div>
            </dl>
          </section>
        )}
        {canManage ? (
          <form action={inviteMember} className="admin-card">
            <h2>Invite a member</h2>
            <p>
              Hollis creates a single-use invitation link. Send it only to the intended
              verified-email recipient.
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
                {isOwner ? <option value="administrator">Administrator</option> : null}
              </select>
            </label>
            <button className="primary-action" type="submit">
              Create invitation link
            </button>
          </form>
        ) : (
          <section className="admin-card admin-permission-summary">
            <h2>Your access</h2>
            <p>
              Your {role.replaceAll("_", " ")} role can view the organization profile and member
              directory. An owner can authorize administrative access by changing your role.
            </p>
          </section>
        )}
      </div>
      {canManage && params.invite === "ready" ? (
        <section className="admin-card invitation-link">
          <h2>Invitation link</h2>
          <InvitationLink />
        </section>
      ) : null}
      <section className="admin-card">
        <h2>Members</h2>
        <div className="admin-list">
          {members.map((member, index) => (
            <div
              className="admin-row"
              key={member.userId ?? `${member.displayName ?? "member"}:${member.role}:${index}`}
            >
              <div className="admin-member-identity">
                <span aria-hidden="true">
                  {(member.displayName || member.email || "M").slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{member.displayName || member.email || "Workspace member"}</strong>
                  {member.email ? <small>{member.email}</small> : null}
                </div>
              </div>
              {canManage &&
              member.userId &&
              member.role !== "owner" &&
              (isOwner || member.role !== "administrator") ? (
                <form action={updateMember}>
                  <input name="userId" type="hidden" value={member.userId} />
                  <select
                    aria-label={`Role for ${member.displayName || member.email || "workspace member"}`}
                    defaultValue={member.role}
                    name="role"
                  >
                    {isOwner ? <option value="administrator">Administrator</option> : null}
                    <option value="reviewer">Reviewer</option>
                    <option value="contributor">Contributor</option>
                    <option value="auditor">Auditor</option>
                  </select>
                  <button className="text-button" type="submit">
                    Update role
                  </button>
                </form>
              ) : (
                <span className="admin-role-label">{member.role.replaceAll("_", " ")}</span>
              )}
            </div>
          ))}
        </div>
      </section>
      {canManage ? (
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
      ) : null}
      {canManage ? (
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
      ) : null}
    </section>
  );
}
