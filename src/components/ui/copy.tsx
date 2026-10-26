"use client";

import { Check, Copy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";

export async function copyText(text: string, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
    return true;
  } catch {
    toast.error("Couldn’t copy");
    return false;
  }
}

export function CopyButton({
  text,
  label = "Copy",
  className,
  iconOnly,
  toastLabel,
}: {
  text: string;
  label?: string;
  className?: string;
  iconOnly?: boolean;
  toastLabel?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(text, toastLabel ?? "Copied")) {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        }
      }}
      aria-label={iconOnly ? label : undefined}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 font-medium transition-[background-color,scale] active:scale-[0.96]",
        className,
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={done ? "y" : "n"}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          className="grid place-items-center"
        >
          {done ? <Check className="size-4" strokeWidth={2.5} /> : <Copy className="size-4" />}
        </motion.span>
      </AnimatePresence>
      {!iconOnly && <span>{done ? "Copied" : label}</span>}
    </button>
  );
}
