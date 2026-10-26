"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { SPRING_SNAPPY, haptic } from "./motion";

// iOS switch in monochrome: the track fills with ink when on.
export function Switch({
  on,
  onChange,
  className,
  disabled,
  "aria-label": ariaLabel,
  id,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        haptic(6);
        onChange(!on);
      }}
      className={cn(
        "relative h-6 w-[42px] shrink-0 rounded-full p-0.5 transition-colors duration-200 disabled:opacity-50",
        on ? "bg-accent" : "bg-surface-3",
        className,
      )}
    >
      <motion.span
        layout
        transition={SPRING_SNAPPY}
        className={cn("block size-5 rounded-full bg-white shadow-[0_1px_1px_rgba(0,0,0,0.12)]", on && "ml-auto")}
        style={on ? { backgroundColor: "var(--on-accent)" } : undefined}
      />
    </button>
  );
}
