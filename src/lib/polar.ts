import "server-only";
import { PolarClientError } from "@polar-sh/sdk";
import { createPolarCore } from "@polar-sh/sdk/2026-10";
import { createCheckouts } from "@polar-sh/sdk/2026-10/services/checkouts";
import { createCustomerSessions } from "@polar-sh/sdk/2026-10/services/customer_sessions";
import { listSubscriptions, revokeSubscriptions as revoke } from "@polar-sh/sdk/2026-10/services/subscriptions";
import { z } from "zod";
import type { Interval } from "@/lib/billing/plan";
import { intervalOf } from "@/lib/data/billing";
import { one, q } from "@/lib/db";
import { env, polarEnv } from "@/lib/env";

// Polar (polar.sh) runs checkout, invoices, taxes and the customer portal. Lovewall keeps a copy of each subscription
// (from webhooks) and works out the plan from it. The Polar customer's external id is the Lovewall user id.
let core: ReturnType<typeof createPolarCore> | null = null;
function client() {
  core ??= createPolarCore({
    accessToken: polarEnv.accessToken,
    environment: polarEnv.server,
    baseUrl: polarEnv.apiUrl,
    timeout: 10,
  });
  return core;
}

export async function checkoutUrl(user: { id: string; email: string; name: string }, interval: Interval): Promise<string> {
  const checkout = await createCheckouts(client())({
    products: [polarEnv.products[interval]],
    external_customer_id: user.id,
    customer_email: user.email,
    customer_name: user.name || null,
    // Back here once paid: the return route pulls the new subscription so the plan shows at once.
    success_url: `${env.appUrl}/api/billing/return`,
    return_url: `${env.appUrl}/app/settings#billing`,
  });
  return checkout.url;
}

export async function portalUrl(userId: string): Promise<string> {
  const session = await createCustomerSessions(client())({
    external_customer_id: userId,
    return_url: `${env.appUrl}/app/settings#billing`,
  });
  return session.customer_portal_url;
}

// The fields Lovewall uses from a Polar subscription (webhook payloads and API responses have the same shape).
const subscriptionSchema = z.object({
  id: z.string().min(1).max(100),
  status: z.string().min(1).max(40),
  customer_id: z.string().min(1).max(100),
  product_id: z.string().min(1).max(100),
  current_period_end: z.string().max(40).nullish(),
  cancel_at_period_end: z.boolean().nullish(),
  ended_at: z.string().max(40).nullish(),
  created_at: z.string().max(40).nullish(),
  modified_at: z.string().max(40).nullish(),
  customer: z.object({ external_id: z.string().max(100).nullish() }).nullish(),
});

// Stores one subscription. Ignores products that aren't Lovewall's (the Polar organization may sell other things)
// and customers that aren't (or are no longer) Lovewall users. An older state never overwrites a newer one.
export async function saveSubscription(input: unknown, userHint?: string): Promise<"saved" | "ignored"> {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return "ignored";
  const s = parsed.data;
  if (!intervalOf(s.product_id)) return "ignored";
  const known = await one<{ user_id: string }>("select user_id from subscriptions where id = $1 or customer_id = $2 limit 1", [
    s.id,
    s.customer_id,
  ]);
  const userId = s.customer?.external_id || known?.user_id || userHint;
  if (!userId) return "ignored";
  const row = await one(
    `insert into subscriptions (id, user_id, customer_id, product_id, status, current_period_end, cancel_at_period_end, ended_at, modified_at)
     select $1, u.id, $3, $4, $5, $6, $7, $8, $9 from auth_users u where u.id = $2
     on conflict (id) do update set customer_id = excluded.customer_id, product_id = excluded.product_id, status = excluded.status,
       current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end,
       ended_at = excluded.ended_at, modified_at = excluded.modified_at, updated_at = now()
     where subscriptions.modified_at is null or excluded.modified_at >= subscriptions.modified_at
     returning id`,
    [
      s.id,
      userId,
      s.customer_id,
      s.product_id,
      s.status,
      s.current_period_end ?? null,
      s.cancel_at_period_end ?? false,
      s.ended_at ?? null,
      s.modified_at ?? s.created_at ?? new Date().toISOString(),
    ],
  );
  return row ? "saved" : "ignored";
}

// Pulls a user's subscriptions straight from Polar (after checkout, before the webhook may have arrived).
export async function syncSubscriptions(userId: string) {
  const list = await listSubscriptions(client())({ external_customer_id: userId, limit: 20 });
  for (const s of list.items) await saveSubscription(s, userId);
}

// Before an account is deleted: stop every renewal, so nobody pays for an account that's gone.
export async function cancelSubscriptions(userId: string) {
  const rows = await q<{ id: string }>(
    "select id from subscriptions where user_id = $1 and status in ('active', 'trialing', 'past_due') and (ended_at is null or ended_at > now())",
    [userId],
  );
  for (const r of rows) {
    try {
      await revoke(client())(r.id);
    } catch (error) {
      // Already revoked (403) or gone (404): nothing left to stop.
      if (error instanceof PolarClientError && (error.statusCode === 403 || error.statusCode === 404)) continue;
      throw error;
    }
  }
}
