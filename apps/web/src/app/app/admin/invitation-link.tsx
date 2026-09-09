"use client";

import { useEffect, useState } from "react";

export function InvitationLink() {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void fetch("/api/workspace/invitation-link", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); const payload = await response.json() as { invitationUrl: string }; setLink(payload.invitationUrl); }).catch(() => setError("The one-time invitation link is no longer available. Create a new invitation.")); }, []);
  if (error) return <p className="auth-error">{error}</p>;
  if (!link) return <p>Preparing the secure invitation link.</p>;
  return <><p>Copy this link now. It will not be stored or emailed by Hollis.</p><input aria-label="Invitation link" readOnly value={link} /></>;
}
