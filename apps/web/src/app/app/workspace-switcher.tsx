import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function switchWorkspaceAction(formData: FormData) {
  "use server";
  const tenantId = formData.get("tenantId");
  const token = (await cookies()).get("hollis_session")?.value;
  if (typeof tenantId !== "string" || !token) redirect("/sign-in");
  const response = await fetch(`${apiUrl}/v1/auth/active-workspace`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ tenantId }), cache: "no-store" });
  if (!response.ok) throw new Error("Workspace could not be activated.");
  redirect("/app");
}

export async function WorkspaceSwitcher({ activeWorkspaceId, workspaceName }: { activeWorkspaceId: string; workspaceName: string }) {
  const token = (await cookies()).get("hollis_session")?.value;
  if (!token) return null;
  const response = await fetch(`${apiUrl}/v1/workspaces`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) return null;
  const workspaces = (await response.json()) as Array<{ tenantId: string; workspaceName: string; role: string }>;
  if (workspaces.length < 2) return null;
  return <details className="workspace-switcher"><summary>{workspaceName}</summary><div>{workspaces.map((workspace) => workspace.tenantId === activeWorkspaceId ? <span key={workspace.tenantId}>{workspace.workspaceName}<small>Current workspace</small></span> : <form action={switchWorkspaceAction} key={workspace.tenantId}><input name="tenantId" type="hidden" value={workspace.tenantId}/><button type="submit">{workspace.workspaceName}<small>{workspace.role}</small></button></form>)}</div></details>;
}
