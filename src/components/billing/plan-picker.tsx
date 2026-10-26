"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { startCheckout } from "@/app/actions/billing";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { PRICES, type Interval } from "@/lib/billing/plan";
import { cn } from "@/lib/cn";

// Monthly or yearly, then Polar's checkout.
export function PlanPicker({ className, stacked }: { className?: string; stacked?: boolean }) {
  const [interval, setInterval] = useState<Interval>("monthly");
  const [pending, start] = useTransition();
  return (
    <div className={cn("flex gap-3", stacked ? "flex-col items-stretch" : "flex-wrap items-center", className)}>
      <Segmented
        label="Billing period"
        value={interval}
        onChange={setInterval}
        fit={!stacked}
        options={[
          { value: "monthly", label: `Monthly · $${PRICES.monthly}` },
          { value: "yearly", label: `Yearly · $${PRICES.yearly}` },
        ]}
      />
      <Button
        size={stacked ? "lg" : "md"}
        disabled={pending}
        className={cn(!stacked && "min-w-[104px]")}
        onClick={() =>
          start(async () => {
            const res = await startCheckout(interval);
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            window.location.assign(res.data.url);
            // Keep the spinner while the browser leaves for the checkout.
            await new Promise((r) => setTimeout(r, 4000));
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-label="Opening checkout" /> : "Subscribe"}
      </Button>
    </div>
  );
}
