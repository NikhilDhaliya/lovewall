import { Link } from "@/components/app/link";
import { buttonClass } from "@/components/ui/button";
import { LeaveSpaceButton } from "@/components/app/leave-space";
import { PlanPicker } from "./plan-picker";

// Shown instead of a space's pages when the owner's hosted plan has ended. Public pages keep working.
// Editors can still leave the space (`leave`).
export function PlanLock({
  reason,
  owner,
  leave,
}: {
  reason: "trial" | "plan" | "owner";
  owner?: string;
  leave?: { spaceId: string; name: string };
}) {
  const title = reason === "trial" ? "Your trial has ended" : reason === "plan" ? "Your plan has ended" : "This space is paused";
  return (
    <main className="grid min-h-[70dvh] place-items-center px-6 py-10 text-center">
      <div className="w-full max-w-[400px] animate-view">
        <h1 className="font-display text-[26px] font-semibold">{title}</h1>
        <p className="mt-1.5 text-[15px] text-muted">
          {reason === "owner" ? `${owner || "The owner"} needs to subscribe. ` : ""}Widgets and the collect page still work.
        </p>
        {reason === "owner" ? (
          <>
            <Link href="/app/settings" className={buttonClass("secondary", "lg", "mt-7 w-full")}>
              Account
            </Link>
            {leave && <LeaveSpaceButton spaceId={leave.spaceId} name={leave.name} className="mt-5" />}
          </>
        ) : (
          <>
            <PlanPicker stacked className="mt-7" />
            <Link
              href="/app/settings"
              className="mt-5 inline-flex h-9 items-center text-[14px] text-muted transition-colors hover:text-ink"
            >
              Account settings
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
