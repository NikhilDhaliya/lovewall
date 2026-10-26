"use client";

import { Link } from "@/components/app/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// Underline tabs that are links (sub-pages of one screen).
export function TabLinks({ tabs, className }: { tabs: { href: string; label: React.ReactNode; exact?: boolean }[]; className?: string }) {
  const pathname = usePathname();
  return (
    <nav className={cn("flex gap-5 shadow-[inset_0_-1px_0_var(--line)]", className)}>
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-10 items-center text-[14px] font-medium whitespace-nowrap transition-colors sm:h-11",
              active ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
            {active && <span className="absolute inset-x-0 -bottom-px h-[1.5px] bg-ink" aria-hidden />}
          </Link>
        );
      })}
    </nav>
  );
}

export function CollectTabs({ spaceId }: { spaceId: string }) {
  return (
    <TabLinks
      className="mb-6"
      tabs={[
        { href: `/app/${spaceId}/collect`, label: "Forms", exact: true },
        { href: `/app/${spaceId}/collect/invites`, label: "Invites" },
      ]}
    />
  );
}
