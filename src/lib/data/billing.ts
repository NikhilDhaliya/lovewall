import "server-only";
import { cache } from "react";
import { planFrom, type Interval, type Plan, type SubscriptionState } from "@/lib/billing/plan";
import { one, q } from "@/lib/db";
import { env, polarEnv } from "@/lib/env";

export function intervalOf(productId: string): Interval | null {
  const { monthly, yearly } = polarEnv.products;
  if (productId && productId === monthly) return "monthly";
  if (productId && productId === yearly) return "yearly";
  return null;
}

// signup_history is keyed by this: SHA-256 of the lowercased address, hex (computed in SQL, so both sides agree).
const EMAIL_HASH = (column: string) => `encode(sha256(convert_to(lower(${column}), 'UTF8')), 'hex')`;

// A user's hosted plan, or null when billing is off (self-hosted: everything is open, nothing is shown). The trial
// runs from the address's first sign-up, also when an earlier account with it was deleted.
export const planFor = cache(async (userId: string): Promise<Plan | null> => {
  if (!env.billing) return null;
  const row = await one<{ signed_up: Date; subs: (Omit<SubscriptionState, "interval"> & { product_id: string })[] }>(
    `select least(u."createdAt", h.first_signed_up_at) as signed_up,
       coalesce(json_agg(json_build_object('status', s.status, 'product_id', s.product_id, 'current_period_end', s.current_period_end,
         'cancel_at_period_end', s.cancel_at_period_end, 'ended_at', s.ended_at)) filter (where s.id is not null), '[]') as subs
     from auth_users u
     left join signup_history h on h.email_hash = ${EMAIL_HASH("u.email")}
     left join subscriptions s on s.user_id = u.id
     where u.id = $1 group by u.id, h.first_signed_up_at`,
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

// Before an account is deleted (hosted only): keep the earliest sign-up date of its address, as a hash.
export async function rememberSignup(userId: string) {
  await q(
    `insert into signup_history (email_hash, first_signed_up_at)
     select ${EMAIL_HASH("email")}, "createdAt" from auth_users where id = $1
     on conflict (email_hash) do update
       set first_signed_up_at = least(signup_history.first_signed_up_at, excluded.first_signed_up_at), deleted_at = now()`,
    [userId],
  );
}
