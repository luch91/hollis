import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./styles.css";

export const metadata: Metadata = {
  description: "Human oversight for consequential automated decisions.",
  title: "Hollis",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <AuthKitProvider>{children}</AuthKitProvider>
      </body>
    </html>
  );
}
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
