"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import { openBillingPortal } from "@/app/actions/billing";
import { Group, GroupRow } from "@/components/app/grouped";
import { daysLeftLabel, PRICES, type Plan } from "@/lib/billing/plan";
import { cn } from "@/lib/cn";
import { PlanPicker } from "./plan-picker";

const date = (iso: string) => new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function summary(plan: Plan): string {
  switch (plan.state) {
    case "trialing":
      return `Trial, ${daysLeftLabel(plan.daysLeft)}`;
    case "ended":
      return plan.reason === "trial" ? "Trial ended" : "Ended";
    case "past_due":
      return "Payment failed";
    default:
      return plan.interval === "yearly" ? `Yearly, $${PRICES.yearly}` : `Monthly, $${PRICES.monthly}`;
  }
}

// Account settings: the hosted plan (only rendered when billing is on).
export function BillingSettings({ plan, subscribed }: { plan: Plan; subscribed?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const paying = plan.state === "active" || plan.state === "canceling" || plan.state === "past_due";

  // Back from Polar's checkout: say so once, then drop the flag from the address.
  useEffect(() => {
    if (!subscribed) return;
    if (paying) toast.success("You’re subscribed");
    else toast("Payment received. Your plan shows here in a minute.");
    router.replace("/app/settings#billing", { scroll: false });
  }, [subscribed, paying, router]);

  return (
    <Group title="Billing" className="scroll-mt-6" id="billing">
      <GroupRow label="Plan">
        <span className={cn("text-[14.5px]", plan.state === "past_due" ? "text-danger" : "text-muted")}>{summary(plan)}</span>
      </GroupRow>
      {plan.state === "active" && plan.renewsAt && (
        <GroupRow label="Renews">
          <span className="text-[14.5px] text-muted">{date(plan.renewsAt)}</span>
        </GroupRow>
      )}
      {plan.state === "canceling" && (
        <GroupRow label="Ends">
          <span className="text-[14.5px] text-muted">{date(plan.endsAt)}</span>
        </GroupRow>
      )}
      {paying ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await openBillingPortal();
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              window.location.assign(res.data.url);
              await new Promise((r) => setTimeout(r, 4000));
            })
          }
          className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-left text-[15px] transition-colors hover:bg-surface-2 disabled:opacity-60"
        >
          {plan.state === "past_due" ? "Update payment method" : "Manage billing"}
          {pending && <Loader2 className="size-4 animate-spin text-faint" aria-label="Opening" />}
        </button>
      ) : (
        <div className="p-3">
          <PlanPicker />
        </div>
      )}
    </Group>
  );
}
