import { Link } from "@/components/app/link";
import { ChevronRight } from "lucide-react";
import { legalEnabled } from "@/lib/legal/config";
import { Group } from "./grouped";

const LINKS = [
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/dpa", label: "Data Processing Agreement" },
  { href: "/legal/refunds", label: "Refunds and cancellation" },
];

// Account settings: where the policies live. Shown only where the legal pages are (hosted, or LEGAL_PAGES=true).
export function LegalSettings() {
  if (!legalEnabled()) return null;
  return (
    <Group title="Legal">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="flex min-h-[52px] items-center justify-between gap-4 px-4 text-[15px] transition-colors hover:bg-surface-2"
        >
          {l.label}
          <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
        </Link>
      ))}
    </Group>
  );
}
