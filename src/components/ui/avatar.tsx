import { cn } from "@/lib/cn";

// A photo, or the neutral silhouette (never initials).
export function Avatar({ src, size = 36, className }: { src?: string | null; size?: number; className?: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className={cn("shrink-0 rounded-full bg-surface-2 object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={cn("shrink-0", className)} aria-hidden>
      <circle cx="20" cy="20" r="20" fill="var(--surface-3)" />
      <circle cx="20" cy="16" r="6.5" fill="var(--faint)" opacity="0.55" />
      <path
        d="M7.5 33.5c2.4-5.6 7-8.5 12.5-8.5s10.1 2.9 12.5 8.5A19.9 19.9 0 0 1 20 40a19.9 19.9 0 0 1-12.5-6.5z"
        fill="var(--faint)"
        opacity="0.55"
      />
    </svg>
  );
}
