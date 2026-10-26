import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { one, q } from "@/lib/db";
import { newId } from "@/lib/ids";

// API keys look like lw_<8-char prefix><32-char secret> (≈190 random bits). The prefix is public: it finds the row
// and names the key in the UI. Only a SHA-256 hash of the whole key is stored, and it is compared in constant time.

export type Scope = "read" | "write";

export type ApiKeyRow = {
  id: string;
  space_id: string;
  name: string;
  scope: Scope;
  prefix: string;
  last_used_at: string | null;
  created_at: string;
};

export type VerifiedKey = { id: string; spaceId: string; ownerId: string; scope: Scope };

const KEY_RE = /^lw_([0-9A-Za-z]{8})[0-9A-Za-z]{32}$/;

export const MAX_KEYS_PER_SPACE = 20;

const hashKey = (key: string) => createHash("sha256").update(key).digest();

export function newKey(): { key: string; prefix: string; hash: string } {
  const prefix = newId(8);
  const key = `lw_${prefix}${newId(32)}`;
  return { key, prefix, hash: hashKey(key).toString("hex") };
}

// The key from an Authorization header (`Bearer lw_...`), or null.
export function bearer(headers: Headers): string | null {
  const value = headers.get("authorization") ?? "";
  const m = value.match(/^Bearer\s+(\S{1,200})$/i);
  return m ? m[1] : null;
}

export async function verifyKey(raw: string | null): Promise<VerifiedKey | null> {
  const m = raw?.match(KEY_RE);
  if (!raw || !m) return null;
  const row = await one<{ id: string; space_id: string; owner_id: string; scope: Scope; hash: string; stale: boolean }>(
    `select k.id, k.space_id, s.owner_id, k.scope, k.hash, (k.last_used_at is null or k.last_used_at < now() - interval '1 minute') as stale
     from api_keys k join spaces s on s.id = k.space_id where k.prefix = $1`,
    [m[1]],
  );
  if (!row) return null;
  const given = hashKey(raw);
  const stored = Buffer.from(row.hash, "hex");
  if (stored.length !== given.length || !timingSafeEqual(stored, given)) return null;
  // "Last used" is shown to the minute, so write it at most once a minute per key.
  if (row.stale) void q("update api_keys set last_used_at = now() where id = $1", [row.id]).catch(() => {});
  return { id: row.id, spaceId: row.space_id, ownerId: row.owner_id, scope: row.scope };
}

export async function listKeys(spaceId: string): Promise<ApiKeyRow[]> {
  return q<ApiKeyRow>(
    `select id, space_id, name, scope, prefix, last_used_at, created_at from api_keys
     where space_id = $1 order by created_at`,
    [spaceId],
  );
}
