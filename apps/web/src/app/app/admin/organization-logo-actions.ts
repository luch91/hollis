"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createWorkspaceRequestHeaders } from "./request-headers";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type OrganizationLogoCandidate = {
  digest: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  previewDataUrl: string;
  sizeBytes: number;
  sourceLabel: string;
  sourceUrl: string;
};

type ActionResult =
  | { candidates: OrganizationLogoCandidate[]; ok: true }
  | { message: string; ok: false };

async function request(path: string, init?: RequestInit) {
  const token = (await cookies()).get("hollis_session")?.value;
  return fetch(`${apiUrl}${path}`, {
    cache: "no-store",
    ...init,
    headers: createWorkspaceRequestHeaders(token, init),
  });
}

export async function discoverOrganizationLogoAction(): Promise<ActionResult> {
  const response = await request("/v1/workspace/logo/discover", {
    body: JSON.stringify({}),
    method: "POST",
  });
  if (response.ok) {
    const result = (await response.json()) as { candidates: OrganizationLogoCandidate[] };
    return { candidates: result.candidates, ok: true };
  }
  const failure = (await response.json().catch(() => null)) as { message?: string } | null;
  return {
    message: failure?.message ?? "Hollis could not find a logo from this website.",
    ok: false,
  };
}

export async function importOrganizationLogoAction(formData: FormData) {
  const sourceUrl = String(formData.get("sourceUrl") ?? "");
  const response = await request("/v1/workspace/logo", {
    body: JSON.stringify({ sourceUrl }),
    method: "POST",
  });
  if (!response.ok) redirect("/app/admin?logo=import-failed");
  revalidatePath("/app/admin");
  revalidatePath("/app", "layout");
  redirect("/app/admin?logo=updated");
}

export async function removeOrganizationLogoAction() {
  const response = await request("/v1/workspace/logo", { method: "DELETE" });
  if (!response.ok) redirect("/app/admin?logo=remove-failed");
  revalidatePath("/app/admin");
  revalidatePath("/app", "layout");
  redirect("/app/admin?logo=removed");
}
