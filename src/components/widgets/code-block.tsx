"use client";

import { CopyButton } from "@/components/ui/copy";
import { cn } from "@/lib/cn";

// Code with a small header (label + copy), so the button never covers the code.
export function CodeBlock({ code, className, label }: { code: string; className?: string; label?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-[10px] bg-surface-2", className)}>
      <div className="flex h-10 items-center justify-between pr-1.5 pl-4">
        <span className="text-[12px] font-medium text-faint">{label}</span>
        <CopyButton
          text={code}
          label="Copy"
          className="h-7 rounded-[8px] px-2.5 text-[12.5px] text-muted hover:bg-surface-3 hover:text-ink"
        />
      </div>
      <pre
        tabIndex={0}
        aria-label={label ? `${label} code` : "Code"}
        className="overflow-x-auto px-4 pt-0.5 pb-4 font-mono text-[12.5px] leading-[1.7] text-ink"
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
