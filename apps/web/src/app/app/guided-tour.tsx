"use client";

import { useEffect, useState } from "react";

const steps = [
  {
    target: "Review",
    title: "Review a demo case",
    body: "Open a case to inspect evidence, policy alignment, and the recorded human decision.",
  },
  {
    target: "Evidence",
    title: "Check the evidence trail",
    body: "Review the managed evidence references and confirm their integrity before deciding.",
  },
  {
    target: "Policies",
    title: "Read the policy control",
    body: "Every case is bound to a published policy version and one named control.",
  },
  {
    target: "Admin",
    title: "Confirm workspace ownership",
    body: "Owners manage the organization profile, members, roles, and invitations here.",
  },
  {
    target: "Overview",
    title: "Return to the review horizon",
    body: "The Priority Map keeps open and completed demo cases visible by risk and deadline.",
  },
  {
    target: "Documentation",
    title: "Keep learning in context",
    body: "Use the documentation menu for the complete Hollis workflow and attestation guide.",
  },
] as const;

export function GuidedTour() {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    if (window.localStorage.getItem("hollis-demo-tour-complete") !== "1") setStep(0);
  }, []);

  if (step === null) return null;
  const current = steps[step]!;
  const finish = () => {
    window.localStorage.setItem("hollis-demo-tour-complete", "1");
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
      <div className="guided-tour-actions">
        {step > 0 ? (
          <button onClick={() => setStep(step - 1)} type="button">
            Back
          </button>
        ) : (
          <span />
        )}
        {step === steps.length - 1 ? (
          <button className="primary-action" onClick={finish} type="button">
            Finish
          </button>
        ) : (
          <button className="primary-action" onClick={() => setStep(step + 1)} type="button">
            Next
          </button>
        )}
      </div>
      <span
        aria-hidden="true"
        className={`guided-tour-connector guided-tour-target-${current.target.toLowerCase()}`}
      />
    </div>
  );
}
