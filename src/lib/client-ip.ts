import { isPrivateAddress } from "@/lib/net";

// Where the visitor's IP comes from (for rate limits). Plain module: the proxy, the auth route and the unit tests use
// it; src/lib/ip.ts wraps it for the rest of the server.
//
// Forwarding headers are only trusted where something trusted writes them:
// - Vercel: its own headers (the platform overwrites whatever a client sent).
// - TRUST_PROXY=1: a reverse proxy the operator runs. By default only the last X-Forwarded-For entry counts (the one
//   that proxy appended; a client can pre-fill the rest). TRUST_PROXY_HEADER names one header the proxy always
//   overwrites instead (x-real-ip, cf-connecting-ip...). Never a list of fallbacks, where a header the proxy doesn't
//   touch could be sent by the client and win.
// - Otherwise the connection's own address, recorded by scripts/client-ip.cjs (`pnpm start`, the Docker image).
// - Failing all of that, "unknown": one shared bucket for everyone.

type Env = Record<string, string | undefined>;
export type IpSource = "vercel" | "proxy" | "socket" | "none";

// The header Lovewall itself fills with the resolved address for Better Auth, which reads exactly one header. Any copy
// a client sends is replaced before Better Auth sees the request (src/app/api/auth/[...all]/route.ts).
export const CLIENT_IP_HEADER = "x-lovewall-client-ip";
// Set by scripts/client-ip.cjs from the TCP connection, replacing anything a client sent.
const SOCKET_HEADER = "x-lovewall-ip";

const on = (value: string | undefined) => value === "1" || value === "true";

export function ipSource(env: Env = process.env): IpSource {
  if (env.VERCEL) return "vercel";
  if (on(env.TRUST_PROXY)) return "proxy";
  if (env.LOVEWALL_SOCKET_IP === "1") return "socket";
  return "none";
}

// The one header TRUST_PROXY_HEADER names, if it is a plausible header name.
export function proxyHeader(env: Env = process.env): string {
  const name = (env.TRUST_PROXY_HEADER ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(name) ? name : "x-forwarded-for";
}

// The entry closest to us: a proxy appends to a list header, and only its own entry is trustworthy.
const last = (value: string | null) => value?.split(",").at(-1)?.trim() || "";
const first = (value: string | null) => value?.split(",")[0]?.trim() || "";
const clean = (ip: string) => ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "") || "unknown";

export function clientIpFrom(headers: Headers, env: Env = process.env): string {
  switch (ipSource(env)) {
    case "vercel":
      return clean(first(headers.get("x-vercel-forwarded-for")) || first(headers.get("x-real-ip")));
    case "proxy":
      return clean(last(headers.get(proxyHeader(env))));
    case "socket":
      return clean(first(headers.get(SOCKET_HEADER)));
    default:
      return "unknown";
  }
}

// Why every visitor might be sharing one rate-limit bucket, when that is likely a mistake: the server sees only
// private addresses (a reverse proxy in front, TRUST_PROXY unset), or can't see addresses at all. Production only.
export function sharedBucketWarning(headers: Headers, env: Env = process.env): string | null {
  if (env.NODE_ENV !== "production") return null;
  const source = ipSource(env);
  if (source === "none")
    return "Client IP unknown, so every visitor shares one rate-limit bucket. Start the server with `pnpm start` or the Docker image (they record each connection's address), or set TRUST_PROXY=1 behind a reverse proxy.";
  if (source !== "socket") return null;
  const peer = first(headers.get(SOCKET_HEADER));
  if (!peer || !isPrivateAddress(peer)) return null;
  return `Requests arrive from ${clean(peer)}, a private address. If a reverse proxy sits in front of Lovewall, set TRUST_PROXY=1 (see .env.example): until then every visitor shares that proxy's rate limits.`;
}
