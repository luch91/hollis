import { describe, expect, it } from "vitest";
import { createWorkspaceRequestHeaders } from "./request-headers";

describe("workspace administration request headers", () => {
  it("does not declare a JSON body for a bodyless request", () => {
    const headers = createWorkspaceRequestHeaders("session-token", { method: "DELETE" });

    expect(headers.get("authorization")).toBe("Bearer session-token");
    expect(headers.has("content-type")).toBe(false);
  });

  it("declares JSON when the request has a body", () => {
    const headers = createWorkspaceRequestHeaders("session-token", {
      body: JSON.stringify({ role: "reviewer" }),
      method: "PATCH",
    });

    expect(headers.get("content-type")).toBe("application/json");
  });

  it("preserves an explicitly supplied content type", () => {
    const headers = createWorkspaceRequestHeaders("session-token", {
      body: "payload",
      headers: { "content-type": "text/plain" },
      method: "POST",
    });

    expect(headers.get("content-type")).toBe("text/plain");
  });
});
