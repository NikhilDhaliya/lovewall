"use client";

import { ChevronLeft, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { Drawer } from "vaul";
import { cn } from "@/lib/cn";
import { useMedia } from "./motion";

export function useIsDesktop() {
  return useMedia("(min-width: 768px)", true);
}

export const overlayClass = "fixed inset-0 z-40 bg-black/25 data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out";
export const dialogClass =
  "fixed top-[10vh] left-1/2 z-50 flex max-h-[80vh] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-[14px] bg-surface shadow-float outline-none ring-1 ring-line data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out";
export const floatingClass =
  "z-50 rounded-xl ring-1 ring-line material-strong shadow-float outline-none data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out";
export const drawerOverlayClass = "fixed inset-0 z-40 bg-black/40";
export const drawerClass =
  "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-[16px] bg-surface pb-safe outline-none ring-1 ring-line";

export function DrawerHandle() {
  return <div className="mx-auto mt-2 h-[5px] w-9 shrink-0 rounded-full bg-faint/40" aria-hidden />;
}

// A centered dialog on laptops, a bottom sheet on phones.
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
  className,
  wide,
  onBack,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  wide?: boolean;
  // Multi-step sheets: a back arrow before the title.
  onBack?: () => void;
}) {
  const desktop = useIsDesktop();
  const back = onBack ? (
    <button
      type="button"
      onClick={onBack}
      className="-ml-2 grid size-8 shrink-0 place-items-center rounded-[8px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      aria-label="Back"
    >
      <ChevronLeft className="size-[18px]" strokeWidth={2.25} />
    </button>
  ) : null;
  if (desktop) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className={overlayClass} />
          <Dialog.Content className={cn(dialogClass, wide && "w-[min(680px,calc(100vw-32px))]", className)} aria-describedby={undefined}>
            <div className="flex h-14 shrink-0 items-center justify-between pr-3 pl-5 hairline-b">
              <div className="flex min-w-0 items-center gap-1">
                {back}
                <Dialog.Title className="truncate font-display text-[16px] font-semibold">{title}</Dialog.Title>
              </div>
              <Dialog.Close
                className="grid size-8 place-items-center rounded-[8px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                aria-label="Close"
              >
                <X className="size-4" strokeWidth={2.5} />
              </Dialog.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            {footer && <div className="shrink-0 px-5 py-3 hairline-t">{footer}</div>}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className={drawerOverlayClass} />
        <Drawer.Content className={cn(drawerClass, className)} aria-describedby={undefined}>
          <DrawerHandle />
          <div className="flex min-w-0 items-center gap-1 px-5 pt-3 pb-2">
            {back}
            <Drawer.Title className="truncate font-display text-[17px] font-semibold">{title}</Drawer.Title>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="shrink-0 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] hairline-t">{footer}</div>}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
