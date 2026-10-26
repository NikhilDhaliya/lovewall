"use client";

import { Tooltip as T } from "radix-ui";

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <T.Provider delayDuration={400} skipDelayDuration={200}>
      {children}
    </T.Provider>
  );
}

export function Tooltip({
  label,
  children,
  side = "top",
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-[80] hidden rounded-md bg-ink px-2 py-1 text-[12px] font-medium text-canvas shadow-soft data-[state=delayed-open]:animate-tip-in data-[state=instant-open]:animate-tip-in md:block"
        >
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
