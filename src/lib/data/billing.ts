import "server-only";
import { cache } from "react";
import { planFrom, type Interval, type Plan, type SubscriptionState } from "@/lib/billing/plan";
import { one } from "@/lib/db";
import { env, polarEnv } from "@/lib/env";

export function intervalOf(productId: string): Interval | null {
  const { monthly, yearly } = polarEnv.products;
  if (productId && productId === monthly) return "monthly";
  if (productId && productId === yearly) return "yearly";
  return null;
}

// A user's hosted plan, or null when billing is off (self-hosted: everything is open, nothing is shown).
export const planFor = cache(async (userId: string): Promise<Plan | null> => {
  if (!env.billing) return null;
  const row = await one<{ signed_up: Date; subs: (Omit<SubscriptionState, "interval"> & { product_id: string })[] }>(
    `select u."createdAt" as signed_up,
       coalesce(json_agg(json_build_object('status', s.status, 'product_id', s.product_id, 'current_period_end', s.current_period_end,
         'cancel_at_period_end', s.cancel_at_period_end, 'ended_at', s.ended_at)) filter (where s.id is not null), '[]') as subs
     from auth_users u left join subscriptions s on s.user_id = u.id where u.id = $1 group by u.id`,
    [userId],
  );
  if (!row) return { state: "ended", reason: "trial" };
  return planFrom(
    row.signed_up,
    row.subs.map((s) => ({ ...s, interval: intervalOf(s.product_id) })),
  );
});

// Billing belongs to the space owner: when their plan has ended, the space's dashboard is locked for every member.
// Public pages (collect, widgets, wall) keep working either way.
export async function spaceLocked(space: { owner_id: string }): Promise<boolean> {
  if (!env.billing) return false;
  return (await planFor(space.owner_id))?.state === "ended";
}
