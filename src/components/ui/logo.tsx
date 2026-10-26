import { cn } from "@/lib/cn";

// The Lovewall mark: a heart on an inverted rounded tile (ink on light, white on dark).
export const HEART_PATH =
  "M12 20.4c-.3 0-.6-.1-.8-.3C6.3 16 3.2 13.1 3.2 9.4 3.2 6.6 5.3 4.5 8 4.5c1.6 0 3 .7 4 2 1-1.3 2.4-2 4-2 2.7 0 4.8 2.1 4.8 4.9 0 3.7-3.1 6.6-8 10.7-.2.2-.5.3-.8.3z";

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={cn("shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="8.5" fill="var(--accent)" />
      <path transform="translate(4 4.4)" d={HEART_PATH} fill="var(--on-accent)" />
    </svg>
  );
}

export function Wordmark({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const mark = size === "lg" ? 40 : size === "sm" ? 24 : 28;
  return (
    <span className={cn("inline-flex items-center gap-2 font-display font-semibold text-ink", className)}>
      <LogoMark size={mark} />
      <span className={cn(size === "lg" ? "text-[26px]" : size === "sm" ? "text-[16px]" : "text-[18px]", "tracking-[-0.025em]")}>
        Lovewall
      </span>
    </span>
  );
}
