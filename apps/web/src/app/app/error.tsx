"use client";

import Link from "next/link";

export default function ApplicationError() {
  return (
    <section className="reference-dashboard reference-application-error">
      <div className="reference-dashboard-empty reference-service-unavailable">
        <span>Workspace recovery</span>
        <h1>Hollis could not load this workspace.</h1>
        <p>
          Your session remains protected. No review decision or evidence record has been changed.
        </p>
        <Link className="reference-primary" href="/app">
          Return to workspace <span>›</span>
        </Link>
      </div>
    </section>
  );
}
