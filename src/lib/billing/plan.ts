// Hosted plans: $9 a month or $90 a year after a 14-day trial that starts at sign-up. Pure functions, so they run
// anywhere (server, client, tests). Only used when billing is on (POLAR_ACCESS_TOKEN set).
export const TRIAL_DAYS = 14;
export const PRICES = { monthly: 9, yearly: 90 } as const;
export type Interval = keyof typeof PRICES;

// A subscription as stored from Polar's webhooks.
export type SubscriptionState = {
  status: string;
  interval: Interval | null;
  current_period_end: Date | string | null;
  cancel_at_period_end: boolean;
  ended_at: Date | string | null;
};

export type Plan =
  | { state: "trialing"; endsAt: string; daysLeft: number }
  | { state: "active"; interval: Interval | null; renewsAt: string | null }
  | { state: "canceling"; interval: Interval | null; endsAt: string }
  | { state: "past_due"; interval: Interval | null }
  | { state: "ended"; reason: "trial" | "plan" };

const DAY = 86_400_000;
const time = (d: Date | string | null) => (d ? new Date(d).getTime() : null);
const iso = (d: Date | string | number) => new Date(d).toISOString();

export function planFrom(signedUpAt: Date | string, subs: SubscriptionState[], now = Date.now()): Plan {
  const notEnded = (s: SubscriptionState) => {
    const ended = time(s.ended_at);
    return ended === null || ended > now;
  };
  const paying = subs.filter((s) => (s.status === "active" || s.status === "trialing") && notEnded(s));
  const renewing = paying.find((s) => !s.cancel_at_period_end);
  if (renewing)
    return {
      state: "active",
      interval: renewing.interval,
      renewsAt: renewing.current_period_end ? iso(renewing.current_period_end) : null,
    };

  // Canceled, but paid until the end of the period.
  const paidUntil = subs
    .filter((s) => (paying.includes(s) || s.status === "canceled") && notEnded(s) && (time(s.current_period_end) ?? 0) > now)
    .sort((a, b) => (time(b.current_period_end) ?? 0) - (time(a.current_period_end) ?? 0))[0];
  if (paidUntil) return { state: "canceling", interval: paidUntil.interval, endsAt: iso(paidUntil.current_period_end!) };

  // A failed renewal: Polar retries the card, and access stays until it gives up (then the subscription is revoked).
  const pastDue = subs.find((s) => s.status === "past_due" && notEnded(s));
  if (pastDue) return { state: "past_due", interval: pastDue.interval };

  const trialEnds = new Date(signedUpAt).getTime() + TRIAL_DAYS * DAY;
  if (trialEnds > now) return { state: "trialing", endsAt: iso(trialEnds), daysLeft: Math.ceil((trialEnds - now) / DAY) };
  const hadPlan = subs.some((s) => s.status !== "incomplete" && s.status !== "incomplete_expired");
  return { state: "ended", reason: hadPlan ? "plan" : "trial" };
}

// No plan (self-hosted) means full access.
export const hasAccess = (plan: Plan | null) => !plan || plan.state !== "ended";

export const daysLeftLabel = (days: number) => (days === 1 ? "1 day left" : `${days} days left`);
