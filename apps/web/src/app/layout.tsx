import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import "./styles.css";
import "./petrol.css";
import "./docs/documentation.css";

export const metadata: Metadata = {
  description: "Human oversight for consequential automated decisions.",
  title: "Hollis",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script src="/assets/theme.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
