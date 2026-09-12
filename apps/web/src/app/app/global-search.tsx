"use client";

import { useEffect, useRef, useState } from "react";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <div className="global-search">
      <button
        aria-expanded={open}
        aria-label="Search workspace"
        className="header-icon-button"
        onClick={() => setOpen(true)}
        type="button"
      >
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      </button>
      {open ? (
        <div className="global-search-overlay">
          <button
            aria-label="Close workspace search"
            className="global-search-backdrop"
            onClick={() => setOpen(false)}
            type="button"
          />
          <section aria-label="Search cases, issues, and reviewers" className="global-search-panel">
            <form action="/app/search" method="get">
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                aria-label="Search workspace"
                minLength={2}
                name="q"
                placeholder="Search cases, issues, or reviewers"
                ref={inputRef}
                required
                type="search"
              />
              <button type="submit">Search</button>
            </form>
            <footer>
              <span>Search is limited to the active workspace.</span>
              <button onClick={() => setOpen(false)} type="button">
                Close
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
