export const documentationNavigation = [
  {
    label: "Start here",
    items: [
      { href: "/docs/how-hollis-works", label: "How Hollis works", slug: "how-hollis-works" },
      { href: "/docs/getting-started", label: "Getting started", slug: "getting-started" },
    ],
  },
  {
    label: "Core workflows",
    items: [
      { href: "/docs/review-cases", label: "Review cases", slug: "review-cases" },
      {
        href: "/docs/policies-and-controls",
        label: "Policies and controls",
        slug: "policies-and-controls",
      },
      { href: "/docs/evidence", label: "Evidence", slug: "evidence" },
      {
        href: "/docs/genlayer-attestations",
        label: "GenLayer attestations",
        slug: "genlayer-attestations",
      },
      {
        href: "/docs/audit-and-exports",
        label: "Audit and exports",
        slug: "audit-and-exports",
      },
    ],
  },
  {
    label: "Workspace",
    items: [
      {
        href: "/docs/workspace-administration",
        label: "Workspace administration",
        slug: "workspace-administration",
      },
      { href: "/docs/troubleshooting", label: "Troubleshooting", slug: "troubleshooting" },
    ],
  },
  {
    label: "Trust",
    items: [
      { href: "/docs/privacy", label: "Privacy", slug: "privacy" },
      { href: "/docs/security", label: "Security", slug: "security" },
      { href: "/docs/terms", label: "Terms", slug: "terms" },
      { href: "/docs/support", label: "Support", slug: "support" },
    ],
  },
] as const;

export const documentationSlugs = documentationNavigation.flatMap((group) =>
  group.items.map((item) => item.slug),
);
