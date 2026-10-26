import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { newId } from "@/lib/ids";

const secret = () => process.env.BETTER_AUTH_SECRET || "lovewall";

// Random tokens that are stored only as a hash (spin-the-wheel claims).
export const newToken = () => newId(24);
export const hashToken = (token: string) => createHash("sha256").update(token).digest("base64url");
export const TOKEN_RE = /^[0-9A-Za-z]{24}$/;

// Signed tokens: "<id>.<signature>", never stored. Each purpose signs with its own label, so an invite link can't
// be replayed as anything else.
function signature(purpose: string, id: string) {
  return createHmac("sha256", secret()).update(`${purpose}:${id}`).digest("base64url").slice(0, 22);
}

export function signId(purpose: string, id: string) {
  return `${id}.${signature(purpose, id)}`;
}

export function verifySigned(purpose: string, token: unknown): string | null {
  if (typeof token !== "string" || token.length > 80) return null;
  const [id, sig] = token.split(".");
  if (!id || !sig || !/^[0-9A-Za-z]{8,32}$/.test(id)) return null;
  const expected = Buffer.from(signature(purpose, id));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}
