"use client";

import {
  createUserWithEmailAndPassword,
  GithubAuthProvider,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  type UserCredential,
} from "firebase/auth";
import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getIdentityPlatformAuth } from "@/lib/identity-platform";

type Mode = "sign-in" | "sign-up";

async function establishHollisSession(credential: UserCredential): Promise<boolean> {
  const identityToken = await credential.user.getIdToken(true);
  const response = await fetch("/api/auth/session", {
    body: JSON.stringify({ identityToken }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error("Hollis could not establish your session.");
  const payload = (await response.json()) as { activeWorkspace: unknown | null };
  return payload.activeWorkspace !== null;
}

function readableError(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return error instanceof Error
      ? error.message
      : "We could not complete that request. Please try again.";
  }

  const code = "code" in error && typeof error.code === "string" ? error.code : null;
  switch (code) {
    case "auth/account-exists-with-different-credential":
      return "An account already exists for this email. Sign in with its original method, then link another method from your profile.";
    case "auth/email-already-in-use":
      return "An account already exists for this email. Sign in instead.";
    case "auth/invalid-credential":
      return "The email or password is not correct.";
    case "auth/popup-closed-by-user":
      return "Sign-in was cancelled.";
    case "auth/weak-password":
      return "Choose a stronger password.";
    default:
      return error instanceof Error
        ? error.message
        : "We could not complete that request. Please try again.";
  }
}

export default function SignInPage() {
  const router = useRouter();
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setReturnTo(new URLSearchParams(window.location.search).get("returnTo"));
  }, []);

  async function finish(credential: UserCredential, created = false) {
    if (created && !credential.user.emailVerified) {
      await sendEmailVerification(credential.user);
      throw new Error("Check your email and verify your address before signing in to Hollis.");
    }
    if (!credential.user.emailVerified) {
      throw new Error("Verify your email before signing in to Hollis.");
    }
    const hasWorkspace = await establishHollisSession(credential);
    router.replace(hasWorkspace ? (returnTo?.startsWith("/") ? returnTo : "/app") : "/onboarding");
    router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const credential =
        mode === "sign-up"
          ? await createUserWithEmailAndPassword(getIdentityPlatformAuth(), email, password)
          : await signInWithEmailAndPassword(getIdentityPlatformAuth(), email, password);
      await finish(credential, mode === "sign-up");
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function signInWith(provider: GoogleAuthProvider | GithubAuthProvider) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await finish(await signInWithPopup(getIdentityPlatformAuth(), provider));
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError("Enter your work email before requesting a password reset.");
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(getIdentityPlatformAuth(), email.trim());
      setNotice("If an account exists for this email, its password-reset message has been sent.");
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="sign-in-title">
        <a className="product-wordmark" href="/">
          Hollis
        </a>
        <p className="eyebrow">Secure workspace access</p>
        <h1 id="sign-in-title">{mode === "sign-in" ? "Welcome back." : "Create your account."}</h1>
        <p className="auth-summary">
          {mode === "sign-in"
            ? "Sign in to the organizations that have granted you access."
            : "Start an organization workspace or join one by invitation."}
        </p>
        <div className="auth-provider-actions">
          <button
            disabled={busy}
            onClick={() => void signInWith(new GoogleAuthProvider())}
            type="button"
          >
            Continue with Google
          </button>
          <button
            disabled={busy}
            onClick={() => void signInWith(new GithubAuthProvider())}
            type="button"
          >
            Continue with GitHub
          </button>
        </div>
        <div className="auth-divider">
          <span>or</span>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Work email
            <input
              autoComplete="email"
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            <span className="auth-password-label">
              Password
              {mode === "sign-in" ? (
                <button disabled={busy} onClick={() => void resetPassword()} type="button">
                  Forgot password?
                </button>
              ) : null}
            </span>
            <input
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              disabled={busy}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="auth-notice" role="status">
              {notice}
            </p>
          ) : null}
          <button className="primary-action" disabled={busy} type="submit">
            {busy ? "Please wait" : mode === "sign-in" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="auth-switch">
          {mode === "sign-in" ? "New to Hollis?" : "Already have an account?"}{" "}
          <button
            disabled={busy}
            onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
            type="button"
          >
            {mode === "sign-in" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </section>
    </main>
  );
}
