"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { Select as S } from "radix-ui";
import { cn } from "@/lib/cn";
import { floatingClass } from "./sheet";

export type Option<T extends string> = { value: T; label: string };

export const triggerClass =
  "inline-flex h-10 max-w-full min-w-0 items-center justify-between gap-1.5 rounded-[8px] bg-surface pr-2.5 pl-3 text-[15px] text-ink ring-1 ring-line outline-none ring-inset transition-colors hover:bg-surface-2 focus-visible:ring-soft data-[state=open]:bg-surface-2 md:h-9 md:text-[13.5px]";

export function Select<T extends string>({
  value,
  options,
  onChange,
  placeholder = "Choose",
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <S.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <S.Trigger className={cn(triggerClass, className)} aria-label={ariaLabel}>
        <span className="min-w-0 truncate">
          <S.Value placeholder={placeholder} />
        </span>
        <S.Icon>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            floatingClass,
            "max-h-[min(360px,var(--radix-select-content-available-height))] min-w-(--radix-select-trigger-width) overflow-hidden",
          )}
        >
          <S.Viewport className="p-1.5">
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="flex h-10 cursor-pointer items-center gap-2 rounded-[8px] pr-3 pl-2 text-[15px] outline-none select-none data-[highlighted]:bg-ink/[0.07] md:h-8 md:text-[13.5px]"
              >
                <span className="grid size-4 place-items-center">
                  <S.ItemIndicator>
                    <Check className="size-4" strokeWidth={2.5} />
                  </S.ItemIndicator>
                </span>
                <S.ItemText>{o.label}</S.ItemText>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
