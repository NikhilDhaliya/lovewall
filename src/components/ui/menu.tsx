"use client";

import { Check } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { cn } from "@/lib/cn";
import { floatingClass } from "./sheet";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({ className, align = "end", ...props }: React.ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={6}
        collisionPadding={12}
        className={cn(
          floatingClass,
          "max-h-[min(420px,var(--radix-dropdown-menu-content-available-height))] min-w-48 origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto p-1.5",
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

const itemClass =
  "flex h-10 cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 text-[15px] outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-ink/[0.07] md:h-8 md:text-[13.5px]";

export function MenuItem({ className, destructive, ...props }: React.ComponentProps<typeof DropdownMenu.Item> & { destructive?: boolean }) {
  return (
    <DropdownMenu.Item className={cn(itemClass, destructive && "text-danger", "[&_svg]:size-4 [&_svg]:shrink-0", className)} {...props} />
  );
}

export function MenuCheck({ checked, children, className, ...props }: React.ComponentProps<typeof DropdownMenu.CheckboxItem>) {
  return (
    <DropdownMenu.CheckboxItem checked={checked} className={cn(itemClass, className)} {...props}>
      <span className="grid size-4 place-items-center">{checked === true && <Check className="size-4" strokeWidth={2.5} />}</span>
      {children}
    </DropdownMenu.CheckboxItem>
  );
}

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof DropdownMenu.Label>) {
  return <DropdownMenu.Label className={cn("px-2.5 pt-1.5 pb-1 text-[12px] font-medium text-faint", className)} {...props} />;
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="mx-1 my-1 h-px bg-line" />;
}
