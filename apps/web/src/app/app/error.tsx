"use client";

import Link from "next/link";

export default function ApplicationError({ reset }: { reset: () => void }) {
  return (
    <section className="reference-dashboard reference-application-error">
      <div className="reference-dashboard-empty reference-service-unavailable">
        <span>Workspace recovery</span>
        <h1>Hollis could not load this workspace.</h1>
        <p>
          Your session remains protected. No review decision or evidence record has been changed.
        </p>
        <div className="application-error-actions">
          <button className="reference-primary" onClick={reset} type="button">
            Try again <span>›</span>
          </button>
          <Link className="reference-secondary" href="/app/review-cases">
            Open review workspace
          </Link>
        </div>
      </div>
    </section>
  );
}
