import "server-only";
import { one } from "@/lib/db";
import { spaceLocked } from "@/lib/data/billing";
import { ipKey } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";
import { bearer, verifyKey, type Scope, type VerifiedKey } from "./keys";
import { logError } from "@/lib/log";

// Shared plumbing for the keyed API (REST v1 and MCP): JSON answers, errors, key checks and rate limits.

export const PER_KEY_PER_MINUTE = 120;
// Failed key checks per IP in 10 minutes before that IP gets 429s (stops guessing and floods of bad keys).
export const FAILED_PER_IP = 20;

export type ErrorCode = "invalid" | "unauthorized" | "forbidden" | "not_found" | "conflict" | "too_large" | "rate_limited" | "server_error";

const BASE = { "Cache-Control": "no-store" };

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { ...BASE, ...headers } });
}

export function apiError(code: ErrorCode, message: string, status: number, headers: Record<string, string> = {}) {
  return json({ error: { code, message } }, status, headers);
}

export const notFound = () => apiError("not_found", "Not found", 404);

function retryAfter(resetAt: Date) {
  return String(Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000)));
}

// Checks the key and its rate limit. Returns the key, or the error response to send.
export async function authorize(request: Request, need: Scope): Promise<{ key: VerifiedKey; headers: Record<string, string> } | Response> {
  const ip = `api-auth-fail:${ipKey(request.headers)}`;
  const blocked = await one<{ count: number; reset_at: Date }>(
    "select count, reset_at from rate_limits where key = $1 and reset_at > now()",
    [ip],
  );
  if (blocked && blocked.count >= FAILED_PER_IP) {
    return apiError("rate_limited", "Too many failed attempts. Try again later.", 429, { "Retry-After": retryAfter(blocked.reset_at) });
  }
  const key = await verifyKey(bearer(request.headers));
  if (!key) {
    await rateLimit(ip, FAILED_PER_IP, 600);
    return apiError("unauthorized", "Missing or invalid API key", 401, { "WWW-Authenticate": 'Bearer realm="lovewall"' });
  }
  const limit = await rateLimit(`api:${key.id}`, PER_KEY_PER_MINUTE, 60);
  const headers = { "X-RateLimit-Limit": String(PER_KEY_PER_MINUTE), "X-RateLimit-Remaining": String(limit.remaining) };
  if (!limit.ok) {
    return apiError("rate_limited", "Too many requests. Try again later.", 429, { ...headers, "Retry-After": retryAfter(limit.resetAt) });
  }
  if (need === "write" && key.scope !== "write") return apiError("forbidden", "This key is read-only", 403, headers);
  // A space whose hosted plan has ended is locked for its API too, like its dashboard (public pages keep working).
  if (await spaceLocked({ owner_id: key.ownerId })) return apiError("forbidden", "This space's plan has ended", 403, headers);
  return { key, headers };
}

// The JSON body of a request (64 KB at most). Returns the parsed value, or the error response to send.
export async function readJson(request: Request): Promise<{ body: unknown } | Response> {
  if (Number(request.headers.get("content-length") ?? 0) > 64 * 1024) return apiError("too_large", "Body too large", 413);
  const raw = await request.text().catch(() => "");
  if (raw.length > 64 * 1024) return apiError("too_large", "Body too large", 413);
  if (!raw.trim()) return { body: {} };
  try {
    return { body: JSON.parse(raw) };
  } catch {
    return apiError("invalid", "Body must be JSON", 400);
  }
}

// Runs a keyed handler: authorizes, then turns unexpected errors into a plain 500 (no internals leak).
export async function keyed(request: Request, need: Scope, fn: (key: VerifiedKey) => Promise<Response>): Promise<Response> {
  try {
    const auth = await authorize(request, need);
    if (auth instanceof Response) return auth;
    const res = await fn(auth.key);
    for (const [name, value] of Object.entries(auth.headers)) res.headers.set(name, value);
    return res;
  } catch (error) {
    logError("api", error);
    return apiError("server_error", "Something went wrong", 500);
  }
}

type Out = { ok: true; data: unknown } | { ok: false; code: ErrorCode; message: string; status: number };

// A service result as a response: `{ data }`, or `{ error }` with its status.
export function send(out: Out, status = 200) {
  return out.ok ? json({ data: out.data }, status) : apiError(out.code, out.message, out.status);
}

// A list result is already `{ data, next_cursor }`.
export function sendList(out: Out) {
  return out.ok ? json(out.data) : apiError(out.code, out.message, out.status);
}
