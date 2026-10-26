import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL, LEGAL_PAGES } from "@/lib/legal/config";

export const metadata: Metadata = { title: "Legal" };

const BLURB: Record<(typeof LEGAL_PAGES)[number]["slug"], string> = {
  terms: "The agreement between you and the operator when you use the hosted service.",
  privacy: "What we collect, why, where it goes, how long we keep it, and your rights.",
  cookies: "Two essential cookies, nothing else. No banner, because there is nothing to opt out of.",
  "acceptable-use": "No fake or undisclosed paid testimonials, no spam, no content you have no right to publish.",
  refunds: "Cancel any time; refund on request in the first days after the first charge.",
  dpa: "For businesses: the data processing terms under the GDPR, UK GDPR and similar laws.",
  subprocessors: "The companies that store or move data for the service, and where.",
  security: "How the service is protected, and how to report a vulnerability.",
};

export default function LegalIndex() {
  return (
    <div>
      <h1 className="font-display text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] sm:text-[32px]">Legal</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-muted">
        Plain words, short pages. {LEGAL.product} is open source; the hosted service at {LEGAL.domain} is run by {LEGAL.operator}.
      </p>
      <ul className="mt-8 divide-y divide-line border-y border-line">
        {LEGAL_PAGES.map((p) => (
          <li key={p.slug}>
            <Link href={`/legal/${p.slug}`} className="block py-4 transition-colors hover:bg-surface-2/60">
              <span className="block text-[16px] font-medium">{p.title}</span>
              <span className="mt-0.5 block text-[14px] text-muted">{BLURB[p.slug]}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-[14px] text-muted">
        Questions about any of this:{" "}
        <a href={`mailto:${LEGAL.contact.legal}`} className="underline decoration-line underline-offset-[3px] hover:decoration-ink">
          {LEGAL.contact.legal}
        </a>
        .
      </p>
    </div>
  );
}
