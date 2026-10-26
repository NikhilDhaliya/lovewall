import { cn } from "@/lib/cn";
import { sourceOf } from "@/lib/sources";

// A source's monochrome mark (X, Google, Trustpilot...). Sources without one render nothing unless `fallback`.
export function SourceIcon({
  source,
  className,
  label,
  fallback,
}: {
  source: string;
  className?: string;
  // Announce the source (when the icon stands alone); otherwise it is decorative.
  label?: boolean;
  fallback?: React.ReactNode;
}) {
  const s = sourceOf(source);
  if (!s?.icon) return <>{fallback ?? null}</>;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("size-4 shrink-0", className)}
      role={label ? "img" : undefined}
      aria-label={label ? s.label : undefined}
      aria-hidden={label ? undefined : true}
    >
      <path d={s.icon} />
    </svg>
  );
}
