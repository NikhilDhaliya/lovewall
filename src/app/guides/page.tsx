import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { DocPage, P } from "@/components/docs/site";
import { GUIDES } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Guides",
  description: "Add a Lovewall testimonial widget to Webflow, WordPress, Shopify, Framer, Squarespace, Wix, Notion and more.",
  alternates: { canonical: "/guides" },
};

export default function Guides() {
  return (
    <DocPage title="Guides" lead="Put your testimonials on any site. Pick where yours lives.">
      <ul className="divide-y divide-line overflow-hidden rounded-[12px] bg-surface ring-1 ring-line">
        {GUIDES.map((g) => (
          <li key={g.slug}>
            <Link
              href={`/guides/${g.slug}`}
              className="flex min-h-[60px] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/70"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{g.name}</span>
                <span className="block text-[13.5px] text-muted">{g.summary}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <P className="text-[14px] text-muted">
        Not listed? If it lets you paste HTML, the{" "}
        <Link href="/guides/html" className="underline decoration-muted/40 underline-offset-2 hover:decoration-ink">
          HTML guide
        </Link>{" "}
        works.
      </P>
    </DocPage>
  );
}
