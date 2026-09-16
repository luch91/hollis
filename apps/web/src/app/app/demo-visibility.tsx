"use client";

import { useEffect } from "react";

const DEMO_HIDDEN_EVENT = "hollis-demo-hidden";

export function DemoVisibility() {
  useEffect(() => {
    const hideDemo = () => document.documentElement.classList.add("demo-content-hidden");
    if (window.localStorage.getItem("hollis-demo-tour-complete") === "1") hideDemo();
    window.addEventListener(DEMO_HIDDEN_EVENT, hideDemo);
    return () => window.removeEventListener(DEMO_HIDDEN_EVENT, hideDemo);
  }, []);

  return null;
}

export function markDemoComplete() {
  window.localStorage.setItem("hollis-demo-tour-complete", "1");
  window.dispatchEvent(new Event(DEMO_HIDDEN_EVENT));
}
