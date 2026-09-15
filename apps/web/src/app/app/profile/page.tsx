import Image from "next/image";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readHollisSession } from "@/lib/hollis-session";
import { createWorkspaceRequestHeaders } from "../admin/request-headers";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type PersonalProfile = {
  avatarUrl: string | null;
  bio: string | null;
  displayName: string | null;
  email: string | null;
  emailVerifiedAt: string | null;
  hasUploadedAvatar: boolean;
  jobTitle: string | null;
  timeZone: string | null;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = (await cookies()).get("hollis_session")?.value;
  const response = await fetch(`${apiUrl}${path}`, {
    cache: "no-store",
    ...init,
    headers: createWorkspaceRequestHeaders(token, init),
  });
  if (response.status === 401) redirect("/sign-in");
  if (response.status === 403) redirect("/access-required");
  if (!response.ok) throw new Error("Personal profile request failed.");
  return (await response.json()) as T;
}

async function updatePersonalProfile(formData: FormData) {
  "use server";
  await api("/v1/profile", {
    body: JSON.stringify({
      bio: String(formData.get("bio") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      jobTitle: String(formData.get("jobTitle") ?? ""),
      timeZone: String(formData.get("timeZone") ?? ""),
    }),
    method: "PUT",
  });
  revalidatePath("/app/profile");
  revalidatePath("/app", "layout");
  redirect("/app/profile?profile=updated");
}

async function uploadAvatar(formData: FormData) {
  "use server";
  const file = formData.get("avatar");
  if (!(file instanceof File) || !file.size) redirect("/app/profile?avatar=missing");
  if (file.size > 192 * 1024) redirect("/app/profile?avatar=too-large");
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) {
    redirect("/app/profile?avatar=unsupported");
  }
  const token = (await cookies()).get("hollis_session")?.value;
  const response = await fetch(`${apiUrl}/v1/profile/avatar`, {
    body: Buffer.from(await file.arrayBuffer()),
    cache: "no-store",
    headers: {
      authorization: `Bearer ${token ?? ""}`,
      "content-type": file.type,
    },
    method: "PUT",
  });
  if (response.status === 401) redirect("/sign-in");
  if (response.status === 403) redirect("/access-required");
  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as { code?: string } | null;
    const code = ["avatar_invalid", "avatar_too_large", "avatar_unsupported"].includes(
      failure?.code ?? "",
    )
      ? failure?.code
      : "failed";
    redirect(`/app/profile?avatar=${code}`);
  }
  revalidatePath("/app/profile");
  revalidatePath("/app", "layout");
  redirect("/app/profile?avatar=updated");
}

async function removeAvatar() {
  "use server";
  await api("/v1/profile/avatar", { method: "DELETE" });
  revalidatePath("/app/profile");
  revalidatePath("/app", "layout");
  redirect("/app/profile?avatar=removed");
}

function avatarMessage(value: string | undefined) {
  const messages = {
    failed: "Your profile image could not be saved. No profile information was changed.",
    "too-large": "Choose an image smaller than 192 KB.",
    missing: "Choose a PNG, JPEG, or WebP image before uploading.",
    removed: "Your uploaded profile image was removed.",
    unsupported: "Use a PNG, JPEG, or WebP image.",
    updated: "Your profile image was saved.",
    avatar_invalid: "The selected image could not be verified.",
    avatar_too_large: "Choose an image smaller than 192 KB.",
    avatar_unsupported: "Use a PNG, JPEG, or WebP image.",
  } as const;
  return value && value in messages ? messages[value as keyof typeof messages] : null;
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ avatar?: string; profile?: string }>;
}) {
  const session = await readHollisSession();
  if (!session?.session.activeWorkspace) redirect("/onboarding");
  const [profile, params] = await Promise.all([api<PersonalProfile>("/v1/profile"), searchParams]);
  const initial = (profile.displayName || profile.email || "H").slice(0, 1).toUpperCase();
  const avatarStatus = avatarMessage(params.avatar);

  return (
    <section className="content-panel personal-profile-page">
      <header className="personal-profile-heading">
        <div>
          <p className="eyebrow">Personal profile</p>
          <h1>Your profile</h1>
          <p>
            Manage the information shown with your review activity. Workspace access remains
            controlled by your organization.
          </p>
        </div>
      </header>
      {params.profile === "updated" ? (
        <aside className="admin-success-notice" aria-live="polite">
          Personal profile saved.
        </aside>
      ) : null}
      {avatarStatus ? (
        <aside
          className={
            params.avatar === "updated" || params.avatar === "removed"
              ? "admin-success-notice"
              : "admin-error-notice"
          }
          aria-live="polite"
        >
          {avatarStatus}
        </aside>
      ) : null}
      <div className="personal-profile-grid">
        <section
          className="personal-profile-card personal-profile-image-card"
          aria-labelledby="profile-image-title"
        >
          <p className="eyebrow">Profile image</p>
          <div className="personal-profile-avatar" aria-label="Profile image" role="img">
            {profile.avatarUrl ? (
              <Image alt="Your profile" fill sizes="112px" src={profile.avatarUrl} unoptimized />
            ) : (
              <span>{initial}</span>
            )}
          </div>
          <h2 id="profile-image-title">Recognizable at a glance</h2>
          <p>
            Use a square PNG, JPEG, or WebP image no larger than 192 KB. Hollis stores uploaded
            images privately.
          </p>
          <form action={uploadAvatar} className="personal-profile-upload">
            <label>
              Choose image
              <input accept="image/jpeg,image/png,image/webp" name="avatar" required type="file" />
            </label>
            <button className="secondary-action" type="submit">
              Upload image
            </button>
          </form>
          {profile.hasUploadedAvatar ? (
            <form action={removeAvatar}>
              <button className="text-button" type="submit">
                Remove uploaded image
              </button>
            </form>
          ) : null}
        </section>
        <form
          action={updatePersonalProfile}
          className="personal-profile-card personal-profile-form"
        >
          <div className="personal-profile-card-heading">
            <div>
              <p className="eyebrow">Profile details</p>
              <h2>How colleagues see you</h2>
            </div>
          </div>
          <label>
            Display name
            <input
              defaultValue={profile.displayName ?? ""}
              maxLength={120}
              name="displayName"
              required
            />
          </label>
          <label>
            Job title <span>Optional</span>
            <input defaultValue={profile.jobTitle ?? ""} maxLength={120} name="jobTitle" />
          </label>
          <label>
            Time zone <span>Optional</span>
            <input
              defaultValue={profile.timeZone ?? ""}
              name="timeZone"
              placeholder="Africa/Lagos"
            />
          </label>
          <label>
            Professional bio <span>Optional</span>
            <textarea defaultValue={profile.bio ?? ""} maxLength={500} name="bio" rows={5} />
          </label>
          <button className="primary-action personal-profile-save" type="submit">
            Save profile
          </button>
        </form>
      </div>
      <section
        className="personal-profile-card personal-profile-identity"
        aria-labelledby="account-identity-title"
      >
        <div className="personal-profile-card-heading">
          <div>
            <p className="eyebrow">Account identity</p>
            <h2 id="account-identity-title">Verified account and current access</h2>
          </div>
        </div>
        <dl>
          <div className="personal-profile-identity-row">
            <dt>Verified email</dt>
            <dd>{profile.email ?? "Not available"}</dd>
          </div>
          <div className="personal-profile-identity-row">
            <dt>Verification</dt>
            <dd>{profile.emailVerifiedAt ? "Verified" : "Not verified"}</dd>
          </div>
          <div className="personal-profile-identity-row">
            <dt>Active workspace</dt>
            <dd>{session.session.activeWorkspace.name}</dd>
          </div>
          <div className="personal-profile-identity-row">
            <dt>Workspace role</dt>
            <dd>{session.session.activeWorkspace.role}</dd>
          </div>
        </dl>
      </section>
    </section>
  );
}
