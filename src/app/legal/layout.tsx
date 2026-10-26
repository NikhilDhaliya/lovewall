import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Wordmark } from "@/components/ui/logo";
import { LEGAL, LEGAL_PAGES, legalEnabled } from "@/lib/legal/config";
import { LegalNav } from "./nav";

export const metadata: Metadata = { robots: { index: true, follow: true } };

// The legal pages exist only on the hosted service or when the operator turns them on (LEGAL_PAGES=true), so the
// decision is made per request, not at build time: a Docker image sets its env when it runs.
export default async function LegalLayout({ children }: LayoutProps<"/legal">) {
  await connection();
  if (!legalEnabled()) notFound();
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-[1080px] items-center justify-between px-5">
          <Link href="/" className="rounded-[8px]" aria-label="Lovewall home">
            <Wordmark size="sm" />
          </Link>
          <Link href="/login" className="text-[14px] text-muted hover:text-ink">
            Sign in
          </Link>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1080px] flex-col gap-8 px-5 py-8 md:flex-row md:gap-14 md:py-12">
        <LegalNav pages={LEGAL_PAGES.map((p) => ({ href: `/legal/${p.slug}`, title: p.title }))} />
        <div className="min-w-0 flex-1 md:max-w-[680px]">{children}</div>
      </div>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1080px] flex-col gap-2 px-5 py-8 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>
            {LEGAL.product} is operated by {LEGAL.operator}.
          </span>
          <span>
            Questions:{" "}
            <a href={`mailto:${LEGAL.contact.legal}`} className="hover:text-ink">
              {LEGAL.contact.legal}
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
