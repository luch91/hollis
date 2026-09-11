"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

function initialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem("hollis-theme");
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(initialTheme());
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("hollis-theme", theme);
  }, [theme]);

  return (
    <fieldset className="theme-toggle" aria-label="Appearance">
      <button
        aria-label="Use dark appearance"
        aria-pressed={theme === "dark"}
        onClick={() => setTheme("dark")}
        type="button"
      >
        <span aria-hidden="true">Dark</span>
      </button>
      <button
        aria-label="Use light appearance"
        aria-pressed={theme === "light"}
        onClick={() => setTheme("light")}
        type="button"
      >
        <span aria-hidden="true">Light</span>
      </button>
    </fieldset>
  );
}
