"use client";

import { useEffect, useState } from "react";

export function InvitationLink() {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void fetch("/api/workspace/invitation-link", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const payload = (await response.json()) as { invitationUrl: string };
        setLink(payload.invitationUrl);
      })
      .catch(() =>
        setError("The one-time invitation link is no longer available. Create a new invitation."),
      );
  }, []);
  if (error) return <p className="auth-error">{error}</p>;
  if (!link) return <p>Preparing the secure invitation link.</p>;
  const invitationLink = link;
  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(invitationLink);
      } else {
        const field = document.createElement("textarea");
        field.value = invitationLink;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        const succeeded = document.execCommand("copy");
        document.body.removeChild(field);
        if (!succeeded) throw new Error("Clipboard access was unavailable.");
      }
      setCopied(true);
    } catch {
      setCopyError("Hollis could not copy the link. Select the link and copy it manually.");
    }
  }
  return (
    <>
      <p>Copy this link now. It will not be stored or emailed by Hollis.</p>
      <div className="invitation-link-control">
        <input aria-label="Invitation link" readOnly value={invitationLink} />
        <button className="text-button" onClick={() => void copy()} type="button">
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      {copyError ? <p className="auth-error">{copyError}</p> : null}
    </>
  );
}
