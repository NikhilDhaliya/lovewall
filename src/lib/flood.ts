// A coarse per-IP request ceiling for every dynamic request (pages, API, embeds, files), kept in memory per server
// instance, so it costs nothing per request. It stops one client from flooding an instance; the Postgres limits in
// src/lib/rate-limit.ts guard each costly or sensitive route across instances. RATE_LIMIT_PER_MINUTE moves the
// ceiling (0 turns it off; on Vercel, add a firewall rule for the same at the edge).

const WINDOW_MS = 60_000;
const MAX_TRACKED = 50_000;

export function floodLimitFromEnv(value: string | undefined): number {
  if (value === undefined || value === "") return 1200;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 1200;
}

export class FloodGate {
  private counts = new Map<string, number>();
  private windowStart = 0;

  constructor(private max: number) {}

  // True while this client is under the ceiling for the current minute.
  allow(ip: string, now = Date.now()): boolean {
    if (!this.max || !ip || ip === "unknown") return true;
    if (now - this.windowStart >= WINDOW_MS || this.counts.size > MAX_TRACKED) {
      this.counts.clear();
      this.windowStart = now;
    }
    const count = (this.counts.get(ip) ?? 0) + 1;
    this.counts.set(ip, count);
    return count <= this.max;
  }

  // Seconds until the current window ends.
  retryAfter(now = Date.now()): number {
    return Math.max(1, Math.ceil((this.windowStart + WINDOW_MS - now) / 1000));
  }
}
