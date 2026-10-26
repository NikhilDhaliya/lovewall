import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { LogoMark, Wordmark } from "@/components/ui/logo";
import { CodeBlock } from "@/components/widgets/code-block";
import { cn } from "@/lib/cn";

// Frame and type for the public docs and guides: the landing page's header and footer, a quiet reading column.

const GITHUB = "https://github.com/NikhilDhaliya/lovewall";

export function SiteFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-40 bar pt-safe hairline-b">
        <nav className="mx-auto flex h-14 max-w-[1080px] items-center justify-between px-5" aria-label="Main">
          <Link href="/" aria-label="Lovewall home" className="rounded-lg">
            <Wordmark size="sm" />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link href="/guides" className="hidden h-9 items-center rounded-[8px] px-3 text-[14px] text-muted transition-colors hover:text-ink sm:flex">
              Guides
            </Link>
            <Link href="/docs/api" className="hidden h-9 items-center rounded-[8px] px-3 text-[14px] text-muted transition-colors hover:text-ink sm:flex">
              API
            </Link>
            <Link href="/login" className="flex h-9 items-center rounded-[8px] px-3 text-[14px] text-muted transition-colors hover:text-ink">
              Sign in
            </Link>
            <Link href="/login" className={buttonClass("primary", "sm", "px-3.5")}>
              Get started
            </Link>
          </div>
        </nav>
      </header>
      {children}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1080px] flex-col items-center justify-between gap-4 px-5 py-8 text-[13px] text-muted sm:flex-row">
          <div className="flex items-center gap-2">
            <LogoMark size={18} />
            <span>Lovewall · Nikhil Dhaliya</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-5" aria-label="Footer">
            <Link href="/guides" className="hover:text-ink">
              Guides
            </Link>
            <Link href="/docs/api" className="hover:text-ink">
              API
            </Link>
            <Link href="/docs/mcp" className="hover:text-ink">
              MCP
            </Link>
            <a href={GITHUB} className="hover:text-ink">
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

// A reading page with an optional "On this page" list beside it on wide screens.
export function DocPage({
  title,
  lead,
  toc,
  back,
  children,
}: {
  title: string;
  lead?: React.ReactNode;
  toc?: { id: string; label: string }[];
  back?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <SiteFrame>
      <div className="mx-auto grid max-w-[1080px] gap-12 px-5 pt-10 pb-28 sm:pt-16 lg:grid-cols-[minmax(0,720px)_200px] lg:justify-between">
        <main className="min-w-0">
          {back && (
            <Link href={back.href} className="mb-6 inline-block text-[14px] text-muted hover:text-ink">
              ← {back.label}
            </Link>
          )}
          <h1 className="font-display text-[34px] leading-[1.1] font-medium tracking-[-0.028em] text-balance sm:text-[42px]">{title}</h1>
          {lead && <p className="mt-4 max-w-[560px] text-[17px] leading-relaxed text-muted">{lead}</p>}
          <div className="mt-10">{children}</div>
        </main>
        {toc && toc.length > 0 && (
          <nav aria-label="On this page" className="max-lg:hidden">
            <div className="sticky top-24">
              <p className="pb-2 text-[13px] font-medium text-muted">On this page</p>
              <ul className="space-y-1.5 border-l border-line">
                {toc.map((t) => (
                  <li key={t.id}>
                    <a href={`#${t.id}`} className="-ml-px block border-l border-transparent pl-3 text-[13.5px] text-muted hover:border-ink hover:text-ink">
                      {t.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        )}
      </div>
    </SiteFrame>
  );
}

export function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-14 scroll-mt-24 font-display text-[24px] leading-tight font-medium tracking-[-0.02em] first:mt-0">
      {children}
    </h2>
  );
}

export function H3({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="mt-9 scroll-mt-24 text-[17px] font-medium">
      {children}
    </h3>
  );
}

export function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mt-3 text-[15.5px] leading-relaxed text-ink/85", className)}>{children}</p>;
}

export function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded-[5px] bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-ink">{children}</code>;
}

export function A({ href, children }: { href: string; children: React.ReactNode }) {
  const external = /^https?:/.test(href);
  const cls = "underline decoration-muted/40 underline-offset-2 hover:decoration-ink";
  return external ? (
    <a href={href} className={cls} rel="noopener">
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export function Code({ code, label }: { code: string; label?: string }) {
  return <CodeBlock code={code} label={label} className="mt-4" />;
}

// An endpoint heading: method and path in plain monospace (no coloured badges).
export function Endpoint({ id, method, path, children }: { id: string; method: string; path: string; children?: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-9">
      <h3 id={id} className="scroll-mt-24 font-mono text-[14.5px] font-medium">
        <span className="text-muted">{method}</span> {path}
      </h3>
      {children}
    </section>
  );
}

// A plain two- or three-column table (fields, errors).
export function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-[10px] ring-1 ring-line">
      <table className="w-full border-collapse text-left text-[14px]">
        <thead>
          <tr className="bg-surface-2/60">
            {head.map((h) => (
              <th key={h} scope="col" className="px-3.5 py-2.5 font-medium text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line align-top">
              {r.map((cell, j) => (
                <td key={j} className={cn("px-3.5 py-2.5", j === 0 ? "font-mono text-[13px] whitespace-nowrap" : "text-ink/85")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Numbered steps as a plain ordered list (no step circles).
export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="mt-6 list-decimal space-y-6 pl-5 text-[15.5px] leading-relaxed marker:text-muted">{children}</ol>;
}

export function Step({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <li className="pl-1.5">
      <p className="font-medium">{title}</p>
      {children && <div className="text-ink/85 [&>p]:mt-1.5">{children}</div>}
    </li>
  );
}
