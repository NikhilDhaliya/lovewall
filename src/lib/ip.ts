import "server-only";
import { createHmac } from "node:crypto";
import { CLIENT_IP_HEADER, clientIpFrom, sharedBucketWarning } from "@/lib/client-ip";

export { ipSource } from "@/lib/client-ip";

// Logged once per process (the proxy and the route bundles share the flag through globalThis).
const warned = Symbol.for("lovewall.shared-ip-bucket-warned");
function warnOnce(headers: Headers) {
  const g = globalThis as { [warned]?: boolean };
  if (g[warned]) return;
  const message = sharedBucketWarning(headers);
  if (!message) return;
  g[warned] = true;
  console.warn(`[lovewall] ${message}`);
}

// The visitor's IP, from the one source this deployment trusts (see src/lib/client-ip.ts), or "unknown".
export function clientIp(headers: Headers): string {
  warnOnce(headers);
  return clientIpFrom(headers);
}

// The same request with the resolved IP in the single header Better Auth reads, replacing any copy the client sent.
export function withClientIp(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.set(CLIENT_IP_HEADER, clientIp(request.headers));
  return new Request(request, { headers });
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
