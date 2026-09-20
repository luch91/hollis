"use client";

import { useRef, useState } from "react";
import { beginEvidenceUploadAction, completeEvidenceVerificationAction } from "./actions";

type UploadState = "quarantined" | "uploading" | "verifying" | "verified" | "failed" | "expired";

const stateCopy: Record<UploadState, string> = {
  quarantined: "Quarantined: a private, time-limited upload authorization has been created.",
  uploading: "Uploading: bytes are being sent to the private quarantine location.",
  verifying:
    "Verifying: Hollis is streaming the provider object and checking its declared digest, type, and size.",
  verified: "Verified: the immutable provider reference is now attached to this case.",
  failed: "Failed: no evidence was attached. You may retry with the selected file.",
  expired:
    "Expired: the time-limited upload authorization is no longer valid. Create a new upload to retry.",
};

function safeFailure(error: unknown): { message: string; state: "failed" | "expired" } {
  const text = error instanceof Error ? error.message.toLowerCase() : "";
  if (text.includes("expired")) {
    return {
      message:
        "The upload authorization expired before verification completed. Retry to create a new authorization.",
      state: "expired",
    };
  }
  if (text.includes("transition") || text.includes("conflict")) {
    return {
      message:
        "This case was frozen in another session. Refresh to view its provider-confirmed evidence set.",
      state: "failed",
    };
  }
  return {
    message:
      "Hollis could not verify this evidence. No object location or provider detail is shown. Retry with the selected file.",
    state: "failed",
  };
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function EvidenceUploader({ caseId }: { caseId: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const busy = state === "quarantined" || state === "uploading" || state === "verifying";

  async function upload() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    if (file.size === 0 || file.size > 524_288_000) {
      setState("failed");
      setMessage("Choose a non-empty file no larger than 500 MB.");
      return;
    }
    try {
      setMessage(null);
      const digest = await sha256(file);
      const mediaType = file.type || "application/octet-stream";
      const started = await beginEvidenceUploadAction({
        caseId,
        digest,
        mediaType,
        sizeBytes: file.size,
      });
      if (!started.ok) {
        if (started.code === "invalid_transition") throw new Error("case frozen conflict");
        throw new Error("evidence authorization failed");
      }
      const authorization = started.upload;
      setState("quarantined");
      if (!authorization.uploadUrl) throw new Error("upload authorization expired");
      setState("uploading");
      const stored = await fetch(authorization.uploadUrl, {
        body: file,
        headers: { "content-type": mediaType },
        method: "PUT",
      });
      if (!stored.ok)
        throw new Error(stored.status === 403 ? "upload authorization expired" : "upload failed");
      setState("verifying");
      const completed = await completeEvidenceVerificationAction(caseId, authorization.evidenceId);
      if (!completed.ok) {
        if (completed.code === "invalid_transition") throw new Error("case frozen conflict");
        if (completed.code === "evidence_upload_expired") {
          throw new Error("upload authorization expired");
        }
        throw new Error("evidence verification failed");
      }
      setState("verified");
      setMessage(
        "The provider-confirmed immutable reference was attached. Refresh the case record to see it in the frozen ledger.",
      );
    } catch (error) {
      const failure = safeFailure(error);
      setState(failure.state);
      setMessage(failure.message);
    }
  }

  return (
    <div>
      <label htmlFor="evidence-file">Select evidence file</label>
      <input disabled={busy} id="evidence-file" ref={fileInput} type="file" />
      <button disabled={busy} onClick={upload} type="button">
        {busy
          ? "Processing evidence…"
          : state === "failed" || state === "expired"
            ? "Retry evidence upload"
            : "Upload and verify evidence"}
      </button>
      <p aria-live="polite" role="status">
        {state ? stateCopy[state] : "No upload is in progress."}
      </p>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
