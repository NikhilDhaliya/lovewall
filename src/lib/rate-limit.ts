import "server-only";
import { one, q } from "@/lib/db";

export type Limit = { ok: boolean; remaining: number; resetAt: Date };

// Fixed-window counter in Postgres: one upsert per check, so it works across serverless instances.
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<Limit> {
  const row = await one<{ count: number; reset_at: Date }>(
    `insert into rate_limits (key, count, reset_at) values ($1, 1, now() + make_interval(secs => $2))
     on conflict (key) do update set
       count = case when rate_limits.reset_at <= now() then 1 else rate_limits.count + 1 end,
       reset_at = case when rate_limits.reset_at <= now() then now() + make_interval(secs => $2) else rate_limits.reset_at end
     returning count, reset_at`,
    [key.slice(0, 200), windowSeconds],
  );
  const count = row?.count ?? 1;
  // Now and then, sweep expired counters so the table stays small.
  if (Math.random() < 0.01) void q("delete from rate_limits where reset_at < now() - interval '1 hour'").catch(() => {});
  return { ok: count <= max, remaining: Math.max(0, max - count), resetAt: row?.reset_at ?? new Date() };
}

// Checks several limits; the first one that is exhausted wins.
export async function rateLimitAll(limits: [key: string, max: number, windowSeconds: number][]): Promise<Limit> {
  let last: Limit = { ok: true, remaining: Infinity, resetAt: new Date() };
  for (const [key, max, win] of limits) {
    last = await rateLimit(key, max, win);
    if (!last.ok) return last;
  }
  return last;
}

export function tooMany(limit: Limit) {
  const retry = Math.max(1, Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000));
  return Response.json({ error: "Too many requests. Try again later." }, { status: 429, headers: { "Retry-After": String(retry) } });
}

// For public pages: whether this visitor (by IP) may load one more. Pages answer "not found" when they may not.
export async function pageAllowed(name: string, max: number, windowSeconds: number): Promise<boolean> {
  const { headers } = await import("next/headers");
  const { ipKey } = await import("@/lib/ip");
  return (await rateLimit(`page:${name}:${ipKey(await headers())}`, max, windowSeconds)).ok;
}
