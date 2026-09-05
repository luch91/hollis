"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const items = [
  { href: "/app", icon: "◉", label: "Review" },
  { href: "/app/cases", icon: "□", label: "Cases" },
  { href: "/app/evidence", icon: "▤", label: "Evidence" },
  { href: "/app/receipts", icon: "▧", label: "Receipts" },
  { href: "/app/exports", icon: "↓", label: "Exports" },
  { href: "/app/policy", icon: "≡", label: "Policy" },
  { href: "/app/admin", icon: "◎", label: "Admin" },
] as const;

export function WorkspaceNavigation() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.navigation = collapsed ? "collapsed" : "expanded";
    return () => {
      delete document.documentElement.dataset.navigation;
    };
  }, [collapsed]);

  return (
    <>
      <nav className="product-nav" aria-label="Workspace sections">
        {items.map((item) => {
          const active =
            item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`product-nav-item${active ? " product-nav-item-active" : ""}`}
              href={item.href}
              key={item.href}
              title={collapsed ? item.label : undefined}
            >
              <span aria-hidden="true">{item.icon}</span>
              <b>{item.label}</b>
            </Link>
          );
        })}
      </nav>
      <button
        className="collapse-navigation"
        onClick={() => setCollapsed((value) => !value)}
        type="button"
      >
        <span aria-hidden="true">{collapsed ? "→" : "←"}</span>
        <b>{collapsed ? "Expand" : "Collapse"}</b>
      </button>
    </>
  );
}
