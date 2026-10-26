import "server-only";
import { createHmac } from "node:crypto";

// Where the visitor's IP comes from (for rate limits). Forwarding headers are only trusted where something trusted
// sets them: Vercel, or a reverse proxy the operator vouches for with TRUST_PROXY=1. Otherwise the connection's own
// address (recorded by scripts/client-ip.cjs), or, failing that, one shared bucket for everyone.
export function ipSource(): "vercel" | "proxy" | "socket" | "none" {
  if (process.env.VERCEL) return "vercel";
  if (process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true") return "proxy";
  if (process.env.LOVEWALL_SOCKET_IP === "1") return "socket";
  return "none";
}

// The same order for Better Auth's own rate limiter.
export function ipHeaderNames(): string[] {
  switch (ipSource()) {
    case "vercel":
      return ["x-vercel-forwarded-for", "x-real-ip"];
    case "proxy":
      return ["x-real-ip", "x-forwarded-for"];
    default:
      return ["x-lovewall-ip"];
  }
}

const first = (value: string | null) => value?.split(",")[0]?.trim() || "";
// X-Forwarded-For grows by one entry per hop and the client can pre-fill it: the entry our own proxy appended (the
// last one) is the only one to trust.
const last = (value: string | null) => value?.split(",").at(-1)?.trim() || "";

export function clientIp(headers: Headers): string {
  if (ipSource() === "none") return "unknown";
  for (const name of ipHeaderNames()) {
    const ip = (name === "x-forwarded-for" ? last : first)(headers.get(name));
    if (ip) return ip.replace(/^::ffff:/i, "");
  }
  return "unknown";
}

// IPs are never stored as-is: a keyed hash is enough to count requests (and to tell sessions apart).
export function hashIp(ip: string): string {
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET || "lovewall")
    .update(ip)
    .digest("base64url")
    .slice(0, 22);
}

export function ipKey(headers: Headers): string {
  return hashIp(clientIp(headers));
}
