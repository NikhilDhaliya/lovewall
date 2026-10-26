"use server";

import { z } from "zod";
import { fail, guard, ok, type Result } from "@/lib/actions";
import { planFor } from "@/lib/data/billing";
import { env } from "@/lib/env";
import { checkoutUrl, portalUrl } from "@/lib/polar";
import { rateLimit } from "@/lib/rate-limit";
import { actionUser } from "@/lib/session";

// Hosted billing only. Each action returns a Polar URL; the browser goes there.
export async function startCheckout(interval: string): Promise<Result<{ url: string }>> {
  return guard(async () => {
    if (!env.billing) return fail("Not found");
    const user = await actionUser();
    const parsed = z.enum(["monthly", "yearly"]).safeParse(interval);
    if (!parsed.success) return fail("Pick monthly or yearly");
    const limit = await rateLimit(`checkout:${user.id}`, 10, 600);
    if (!limit.ok) return fail("Too many tries. Try again in a few minutes.");
    const plan = await planFor(user.id);
    if (plan && plan.state !== "trialing" && plan.state !== "ended") return fail("You already have a plan");
    return ok({ url: await checkoutUrl(user, parsed.data) });
  });
}

export async function openBillingPortal(): Promise<Result<{ url: string }>> {
  return guard(async () => {
    if (!env.billing) return fail("Not found");
    const user = await actionUser();
    const limit = await rateLimit(`billing-portal:${user.id}`, 20, 600);
    if (!limit.ok) return fail("Too many tries. Try again in a few minutes.");
    return ok({ url: await portalUrl(user.id) });
  });
}
