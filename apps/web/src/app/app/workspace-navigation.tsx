"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/app", label: "Overview" },
  { href: "/app/review-cases", label: "Reviews" },
  { href: "/app/cases", label: "Cases" },
  { href: "/app/evidence", label: "Evidence" },
  { href: "/app/policy", label: "Policies" },
  { href: "/app/receipts", label: "Receipts" },
  { href: "/app/exports", label: "Exports" },
  { href: "/app/audit", label: "Audit" },
  { href: "/app/admin", label: "Admin" },
] as const;

export function WorkspaceNavigation() {
  const pathname = usePathname();

  return (
    <nav className="product-nav" aria-label="Workspace sections">
      {items.map((item) => {
        const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`product-nav-item${active ? " product-nav-item-active" : ""}`}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
