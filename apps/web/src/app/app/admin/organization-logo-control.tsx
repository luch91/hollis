"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import {
  discoverOrganizationLogoAction,
  importOrganizationLogoAction,
  type OrganizationLogoCandidate,
  removeOrganizationLogoAction,
} from "./organization-logo-actions";

export function OrganizationLogoControl({
  logoUrl,
  organizationName,
}: {
  logoUrl: string | null;
  organizationName: string;
}) {
  const [candidates, setCandidates] = useState<OrganizationLogoCandidate[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const findLogo = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await discoverOrganizationLogoAction();
      if (!result.ok) {
        setCandidates([]);
        setMessage(result.message);
        return;
      }
      setCandidates(result.candidates);
      setMessage(
        result.candidates.length === 1
          ? "One possible logo was found. Confirm it before Hollis imports a managed copy."
          : `${result.candidates.length} possible logos were found. Choose the correct one.`,
      );
    });
  };

  return (
    <section className="organization-logo-control" aria-labelledby="organization-media-title">
      <div className="organization-logo-intro">
        <div
          aria-label={`${organizationName} logo preview`}
          className="organization-logo-preview"
          role="img"
        >
          {logoUrl ? (
            <Image alt="" height={64} src={logoUrl} unoptimized width={64} />
          ) : (
            <span>{organizationName.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div>
          <p className="eyebrow">Organization identity</p>
          <h2 id="organization-media-title">Brand asset</h2>
          <p>
            Find an organization mark from the website in your profile, then approve a managed copy
            for Hollis to store privately.
          </p>
        </div>
      </div>
      <div className="organization-logo-actions">
        <button className="secondary-action" disabled={pending} onClick={findLogo} type="button">
          {pending ? "Finding logos…" : "Find logo from website"}
        </button>
        {logoUrl ? (
          <form action={removeOrganizationLogoAction}>
            <button className="text-button" type="submit">
              Remove logo
            </button>
          </form>
        ) : null}
      </div>
      {message ? (
        <p className="organization-logo-message" role="status">
          {message}
        </p>
      ) : null}
      {candidates.length ? (
        <ul aria-label="Logo candidates" className="organization-logo-candidates">
          {candidates.map((candidate) => (
            <li key={candidate.sourceUrl}>
              <Image alt="" height={92} src={candidate.previewDataUrl} unoptimized width={180} />
              <div>
                <strong>{candidate.sourceLabel}</strong>
                <small>{candidate.mediaType.replace("image/", "").toUpperCase()}</small>
              </div>
              <form action={importOrganizationLogoAction}>
                <input name="sourceUrl" type="hidden" value={candidate.sourceUrl} />
                <button className="primary-action" type="submit">
                  Use this logo
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
