import Link from "next/link";
import { cn } from "@/lib/cn";
import { env } from "@/lib/env";
import { legalEnabled } from "@/lib/legal/config";

type Item = { href: string; label: string };

const ALL: Item[] = [
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/security", label: "Security" },
];

// Small links to the legal pages. Renders nothing when the pages are off (self-host without LEGAL_PAGES).
// `only` picks a subset, e.g. ["Privacy"] under a collect form.
// `bare` renders the links alone, for a footer that already has a <nav>.
// `absolute` links to the app's own host (collect pages can be served on a customer's domain).
export function LegalLinks({
  only,
  bare,
  absolute,
  className,
  linkClassName,
}: {
  only?: string[];
  bare?: boolean;
  absolute?: boolean;
  className?: string;
  linkClassName?: string;
}) {
  if (!legalEnabled()) return null;
  const items = only ? ALL.filter((i) => only.includes(i.label)) : ALL;
  const links = items.map((i) => (
    <Link key={i.href} href={absolute ? `${env.appUrl}${i.href}` : i.href} className={cn("hover:text-ink", linkClassName)}>
      {i.label}
    </Link>
  ));
  if (bare) return <>{links}</>;
  return (
    <nav aria-label="Legal" className={cn("flex items-center gap-5", className)}>
      {links}
    </nav>
  );
}
