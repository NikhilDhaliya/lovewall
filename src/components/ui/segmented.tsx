"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { SPRING } from "./motion";

// Segmented control: a hairline track with a sliding thumb. variant "tabs" is a plain row of words with a sliding
// underline (for filters that sit above a list).
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  size = "md",
  label,
  fit,
  variant = "track",
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
  label?: string;
  // Segments sized by their labels with equal padding (for labels of different lengths, e.g. "Approved 6" / "All").
  fit?: boolean;
  variant?: "track" | "tabs";
}) {
  const id = useId();
  const tabs = variant === "tabs";
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        fit || tabs ? "flex" : "grid",
        tabs ? "gap-5" : "rounded-[8px] bg-surface p-0.5 ring-1 ring-line ring-inset",
        className,
      )}
      style={fit || tabs ? undefined : { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      onKeyDown={(e) => {
        const i = options.findIndex((o) => o.value === value);
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          const next = options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length];
          onChange(next.value);
          (e.currentTarget.querySelectorAll("button")[options.indexOf(next)] as HTMLButtonElement | undefined)?.focus();
        }
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => !active && onChange(o.value)}
            className={cn(
              "relative min-w-0 font-medium whitespace-nowrap transition-colors",
              tabs
                ? "h-10 text-[14px] sm:h-12"
                : cn("rounded-[6px]", fit ? "flex-auto px-3" : "px-2", size === "md" ? "h-8 text-[13px]" : "h-7 text-xs"),
              active ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={SPRING}
                className={tabs ? "absolute inset-x-0 -bottom-px h-[1.5px] bg-ink" : "absolute inset-0 rounded-[6px] bg-surface-2"}
                aria-hidden
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
