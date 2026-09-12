export function createWorkspaceRequestHeaders(
  token: string | undefined,
  init?: RequestInit,
): Headers {
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token ?? ""}`);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return headers;
}
