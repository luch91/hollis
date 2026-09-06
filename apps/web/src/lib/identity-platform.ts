"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { type Auth, getAuth } from "firebase/auth";

const apiKey = process.env.NEXT_PUBLIC_IDENTITY_PLATFORM_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_IDENTITY_PLATFORM_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_IDENTITY_PLATFORM_PROJECT_ID;

let identityPlatformAuth: Auth | undefined;

export function getIdentityPlatformAuth(): Auth {
  if (identityPlatformAuth) return identityPlatformAuth;

  if (!apiKey || !authDomain || !projectId) {
    throw new Error("Identity Platform web configuration is incomplete.");
  }

  const application =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          apiKey,
          authDomain,
          projectId,
        });

  identityPlatformAuth = getAuth(application);
  return identityPlatformAuth;
}
