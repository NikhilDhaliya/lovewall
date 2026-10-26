"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { leaveSpace } from "@/app/actions/members";
import { confirmAction } from "@/components/ui/confirm";
import { cn } from "@/lib/cn";

// For editors, also on a paused space (its pages are locked, leaving isn't).
export function LeaveSpaceButton({ spaceId, name, className }: { spaceId: string; name: string; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await confirmAction({
          title: `Leave ${name}?`,
          message: "You lose access until someone invites you again.",
          confirmLabel: "Leave",
          destructive: true,
        });
        if (!ok) return;
        const res = await leaveSpace(spaceId);
        if (!res.ok) return toast.error(res.error);
        toast.success(`You left ${name}`);
        router.replace("/app");
      }}
      className={cn("inline-flex h-9 items-center text-[14px] font-medium text-danger transition-opacity hover:opacity-80", className)}
    >
      Leave space
    </button>
  );
}
