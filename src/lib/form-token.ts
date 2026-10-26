import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// A signed "form shown at" stamp: submissions faster than a human could type, or days old, are refused.
function sign(spaceId: string, ts: number) {
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET || "lovewall")
    .update(`${spaceId}:${ts}`)
    .digest("base64url")
    .slice(0, 24);
}

export function formToken(spaceId: string) {
  const ts = Date.now();
  return `${ts}.${sign(spaceId, ts)}`;
}

export function checkFormToken(spaceId: string, token: unknown, minMs = 2500): "ok" | "fast" | "bad" {
  if (typeof token !== "string") return "bad";
  const [tsRaw, sig] = token.split(".");
  const ts = Number(tsRaw);
  if (!Number.isFinite(ts) || !sig) return "bad";
  const expected = Buffer.from(sign(spaceId, ts));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "bad";
  const age = Date.now() - ts;
  if (age < minMs) return "fast";
  if (age > 1000 * 60 * 60 * 24) return "bad";
  return "ok";
}
