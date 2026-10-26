"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { SPRING_SNAPPY, haptic } from "./motion";

export const STAR_PATH = "M12 2.6l2.83 6.08 6.67.78-4.93 4.55 1.31 6.58L12 17.3l-5.88 3.29 1.31-6.58L2.5 9.46l6.67-.78z";

export function Stars({ value, size = 14, className }: { value: number | null; size?: number; className?: string }) {
  if (!value) return null;
  return (
    <span className={cn("inline-flex gap-[2px] text-star", className)} role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="currentColor"
          className={i <= value ? "" : "text-surface-3"}
          aria-hidden
        >
          <path d={STAR_PATH} />
        </svg>
      ))}
    </span>
  );
}

// Tap a star to rate; arrow keys work too. Tapping the current value clears it.
export function StarInput({
  value,
  onChange,
  size = 36,
  label = "Rating",
  starLabel = (i) => `${i} star${i > 1 ? "s" : ""}`,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  size?: number;
  label?: string;
  starLabel?: (i: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex items-center gap-1"
      onMouseLeave={() => setHover(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          onChange(Math.min(5, (value ?? 0) + 1));
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          onChange(Math.max(1, (value ?? 2) - 1));
        }
      }}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <motion.button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={starLabel(i)}
          tabIndex={(value ?? 1) === i ? 0 : -1}
          whileTap={{ scale: 0.82 }}
          animate={{ scale: i <= shown ? 1 : 0.92 }}
          transition={SPRING_SNAPPY}
          onMouseEnter={() => setHover(i)}
          onClick={() => {
            haptic(6);
            onChange(value === i ? null : i);
          }}
          className="grid place-items-center rounded-full p-0.5"
          style={{ width: size + 4, height: size + 4 }}
        >
          <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            aria-hidden
            className={cn("transition-colors duration-150", i <= shown ? "text-star" : "text-surface-3")}
            fill="currentColor"
          >
            <path d={STAR_PATH} />
          </svg>
        </motion.button>
      ))}
    </div>
  );
}
