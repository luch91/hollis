"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { markDemoComplete } from "./demo-visibility";

const steps = [
  {
    path: "/app",
    selector: ".overview-horizon-action",
    title: "Open the review workspace",
    body: "Start with the priority map, then open the review workspace.",
  },
  {
    path: "/app/review-cases",
    selector: ".reference-case-list > a",
    title: "Choose a case",
    body: "Each case is its own record. Open one to follow its evidence and review trail.",
  },
  {
    path: "/app/review-cases",
    selector: '.case-tabs a[href*="tab=evidence"]',
    title: "Inspect the evidence",
    body: "Open Evidence to confirm the managed references before recording judgment.",
  },
  {
    path: "/app/review-cases",
    selector: '.case-tabs a[href*="tab=summary"]',
    title: "Return to the decision",
    body: "Return to the summary when you are ready to record the human outcome.",
  },
  {
    path: "/app/review-cases",
    selector: ".human-review-card button.reference-primary",
    title: "Record human judgment",
    body: "Claim the case, then choose the outcome and add a rationale. The decision stays human-authorized.",
  },
  {
    path: "/app/review-cases",
    selector: ".genlayer-panel",
    title: "Check independent attestation",
    body: "After human review, Hollis submits the declared process for GenLayer verification when configured.",
  },
  {
    path: "/app/review-cases",
    selector: ".export-formats a",
    title: "Export the record",
    body: "Finish by downloading the portable audit record in the format your reviewers need.",
  },
] as const;

export function GuidedTour() {
  const [step, setStep] = useState<number | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (window.localStorage.getItem("hollis-demo-tour-complete") !== "1") setStep(0);
  }, []);

  const current = step === null ? null : (steps[step] ?? steps[0]);

  useEffect(() => {
    if (!current || !pathname.startsWith(current.path)) return;
    const target = document.querySelector(current.selector);
    target?.classList.add("guided-tour-focus");
    const advance = (event: MouseEvent) => {
      if (target?.contains(event.target as Node))
        setStep((value) => (value === null || value === steps.length - 1 ? null : value + 1));
    };
    document.addEventListener("click", advance, true);
    return () => {
      target?.classList.remove("guided-tour-focus");
      document.removeEventListener("click", advance, true);
    };
  }, [current, pathname]);

  if (step === null || !current) return null;
  const finish = () => {
    markDemoComplete();
    setStep(null);
  };

  return (
    <div aria-label="Hollis demo tour" className="guided-tour" role="dialog">
      <div className="guided-tour-progress">
        {step + 1} of {steps.length}
      </div>
      <button aria-label="Close tour" className="guided-tour-close" onClick={finish} type="button">
        ×
      </button>
      <p className="eyebrow">Hollis demo workspace</p>
      <h2>{current.title}</h2>
      <p>{current.body}</p>
      {!pathname.startsWith(current.path) ? (
        <button
          className="guided-tour-primary guided-tour-open"
          onClick={() => router.push(current.path)}
          type="button"
        >
          Open {current.title.replace(/^Open the /, "")}
        </button>
      ) : null}
      <div className="guided-tour-actions">
        {step > 0 ? (
          <button onClick={() => setStep(step - 1)} type="button">
            Back
          </button>
        ) : (
          <span />
        )}
        {step === steps.length - 1 ? (
          <button className="guided-tour-primary" onClick={finish} type="button">
            Finish
          </button>
        ) : (
          <button className="guided-tour-primary" onClick={() => setStep(step + 1)} type="button">
            Next
          </button>
        )}
      </div>
    </div>
  );
}
