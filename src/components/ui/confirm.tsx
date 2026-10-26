"use client";

import { AlertDialog } from "radix-ui";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { haptic } from "./motion";
import { useIsDesktop } from "./sheet";

// Confirmations instead of the browser's confirm(): an action sheet on phones, an alert on laptops.
type Request = { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean };

let show: ((r: Request & { resolve: (ok: boolean) => void }) => void) | null = null;

export function confirmAction(request: Request): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) return resolve(false);
    show({ ...request, resolve });
  });
}

export function ConfirmHost() {
  const desktop = useIsDesktop();
  const [request, setRequest] = useState<(Request & { resolve: (ok: boolean) => void }) | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    show = (r) => {
      setRequest(r);
      setOpen(true);
      if (r.destructive) haptic(6);
    };
    return () => {
      show = null;
    };
  }, []);

  function finish(ok: boolean) {
    request?.resolve(ok);
    setOpen(false);
  }

  const label = request?.confirmLabel ?? "OK";
  const cancel = request?.cancelLabel ?? "Cancel";

  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => !o && finish(false)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[70] bg-black/30 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        {desktop ? (
          <AlertDialog.Content
            className="fixed top-1/2 left-1/2 z-[71] w-[300px] rounded-[12px] bg-surface p-5 text-center shadow-float ring-1 ring-line outline-none data-[state=closed]:animate-alert-out data-[state=open]:animate-alert-in"
            onEscapeKeyDown={() => finish(false)}
          >
            <AlertDialog.Title className="text-[15px] font-semibold">{request?.title}</AlertDialog.Title>
            {request?.message ? (
              <AlertDialog.Description className="mt-1 text-[13px] leading-snug text-muted">{request.message}</AlertDialog.Description>
            ) : (
              <AlertDialog.Description className="sr-only">{request?.title}</AlertDialog.Description>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <AlertDialog.Cancel
                onClick={() => finish(false)}
                className="h-9 rounded-[8px] bg-surface text-[13px] font-medium ring-1 ring-line transition-colors ring-inset hover:bg-surface-2"
              >
                {cancel}
              </AlertDialog.Cancel>
              <AlertDialog.Action
                onClick={() => finish(true)}
                className={cn(
                  "h-9 rounded-[8px] text-[13px] font-medium transition-colors",
                  request?.destructive ? "bg-danger text-white hover:opacity-90" : "bg-accent text-on-accent hover:bg-accent-hover",
                )}
              >
                {label}
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        ) : (
          <AlertDialog.Content
            className="fixed inset-x-0 bottom-0 z-[71] px-2 pb-[max(8px,env(safe-area-inset-bottom))] outline-none data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in"
            onEscapeKeyDown={() => finish(false)}
          >
            <div className="overflow-hidden rounded-[14px] material-strong text-center">
              <div className="px-4 pt-3.5 pb-3">
                <AlertDialog.Title className="text-[13px] font-semibold text-muted">{request?.title}</AlertDialog.Title>
                {request?.message ? (
                  <AlertDialog.Description className="mt-0.5 text-[13px] leading-snug text-muted">
                    {request.message}
                  </AlertDialog.Description>
                ) : (
                  <AlertDialog.Description className="sr-only">{request?.title}</AlertDialog.Description>
                )}
              </div>
              <AlertDialog.Action
                onClick={() => finish(true)}
                className={cn(
                  "h-14 w-full border-t border-line text-[18px] active:bg-ink/8",
                  request?.destructive ? "text-danger" : "text-ink",
                )}
              >
                {label}
              </AlertDialog.Action>
            </div>
            <AlertDialog.Cancel
              onClick={() => finish(false)}
              className="mt-2 h-14 w-full rounded-[14px] bg-surface text-[18px] font-semibold active:bg-surface-2"
            >
              {cancel}
            </AlertDialog.Cancel>
          </AlertDialog.Content>
        )}
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
