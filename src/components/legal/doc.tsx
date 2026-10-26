import Link from "next/link";
import { cn } from "@/lib/cn";
import { LEGAL } from "@/lib/legal/config";

// Building blocks for the legal pages: one calm column of text, hairlines between sections, no decoration.

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function Doc({ title, lead, children }: { title: string; lead?: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className="min-w-0 flex-1">
      <header className="pb-6">
        <h1 className="font-display text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] sm:text-[32px]">{title}</h1>
        <p className="mt-2 text-[14px] text-muted">
          {LEGAL.effectiveDate ? `Effective ${formatDate(LEGAL.effectiveDate)}` : "Draft, not yet in effect"} · Operator: {LEGAL.operator}
        </p>
        {lead && <p className="mt-4 text-[16px] leading-relaxed text-muted">{lead}</p>}
      </header>
      <div className="divide-y divide-line border-t border-line">{children}</div>
    </article>
  );
}

export function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 py-7">
      <h2 className="text-[17px] leading-snug font-semibold tracking-[-0.01em]">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink/90">{children}</div>
    </section>
  );
}

export function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={className}>{children}</p>;
}

export function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-faint">{children}</ul>;
}

export function Ol({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5 marker:text-faint">{children}</ol>;
}

// A plain table with hairlines. Cells wrap, so nothing scrolls sideways on a phone.
export function Table({ head, rows, className }: { head: string[]; rows: React.ReactNode[][]; className?: string }) {
  return (
    <table className={cn("w-full border-collapse text-[14px]", className)}>
      <thead>
        <tr className="border-b border-line text-left text-[13px] font-medium text-muted">
          {head.map((h, i) => (
            <th key={i} className="px-1 py-2 align-bottom font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((row, i) => (
          <tr key={i} className="align-top">
            {row.map((cell, j) => (
              <td key={j} className="px-1 py-2.5 leading-snug break-words hyphens-auto">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function A({ href, children }: { href: string; children: React.ReactNode }) {
  const external = /^https?:/.test(href);
  const cls = "underline decoration-line underline-offset-[3px] transition-colors hover:decoration-ink";
  if (external)
    return (
      <a href={href} className={cls} rel="noopener noreferrer">
        {children}
      </a>
    );
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export function Mail({ address }: { address: string }) {
  return <A href={`mailto:${address}`}>{address}</A>;
}

// Something the operator decides: visible on the page so nobody mistakes a draft value for a promise.
export function OwnerNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[8px] bg-surface-2 px-3 py-2 text-[13px] text-muted">{children}</p>;
}
