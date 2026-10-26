"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// The list of documents: a column beside the text on wide screens, one scrolling row on phones.
export function LegalNav({ pages }: { pages: { href: string; title: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Legal pages" className="-mx-5 shrink-0 md:mx-0 md:w-[200px]">
      <ul className="flex gap-1 overflow-x-auto px-5 md:flex-col md:px-0 [&::-webkit-scrollbar]:hidden">
        <li className="shrink-0">
          <Link
            href="/legal"
            className={cn(
              "block rounded-[8px] px-2.5 py-1.5 text-[14px] whitespace-nowrap transition-colors",
              path === "/legal" ? "bg-surface-2 font-medium text-ink" : "text-muted hover:text-ink",
            )}
            aria-current={path === "/legal" ? "page" : undefined}
          >
            Overview
          </Link>
        </li>
        {pages.map((p) => {
          const active = path === p.href;
          return (
            <li key={p.href} className="shrink-0">
              <Link
                href={p.href}
                className={cn(
                  "block rounded-[8px] px-2.5 py-1.5 text-[14px] whitespace-nowrap transition-colors",
                  active ? "bg-surface-2 font-medium text-ink" : "text-muted hover:text-ink",
                )}
                aria-current={active ? "page" : undefined}
              >
                {p.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
