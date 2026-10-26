import "server-only";
import type { PoolClient } from "pg";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";
import { one, q } from "@/lib/db";
import { head, presignPut, spacePrefix } from "@/lib/storage";
import { EXT, uploadRules, type UploadKind } from "@/lib/validation";

export function fileUrl(key: string | null | undefined): string | null {
  return key ? `${env.appUrl}/api/files/${key}` : null;
}

const MB = 1024 * 1024;

// Bytes that public forms may leave unclaimed (asked for, not yet attached to a testimonial) within an hour: per visitor
// and per space. Room for a few of the largest videos either way, so a raised MAX_VIDEO_MB still fits.
export function publicUploadBudget(maxVideoMb = env.maxVideoMb) {
  return { ip: Math.max(300, maxVideoMb * 3) * MB, space: Math.max(2048, maxVideoMb * 20) * MB };
}

// Records the upload and returns a PUT URL that accepts exactly this type and size. `ipHash` marks an upload from a
// public form: it is refused when the visitor's or the space's unclaimed bytes of the last hour would pass the budget.
export async function createUpload(spaceId: string, kind: UploadKind, contentType: string, size: number, opts: { ipHash?: string } = {}) {
  const rules = uploadRules(kind, env.maxVideoMb);
  if (!rules.types.includes(contentType)) return { ok: false as const, error: "That file type isn't supported" };
  if (!Number.isInteger(size) || size <= 0) return { ok: false as const, error: "Empty file" };
  if (size > rules.max) return { ok: false as const, error: `Too large (max ${Math.round(rules.max / MB)} MB)` };
  const key = `${spacePrefix(spaceId)}${kind}/${newId(16)}.${EXT[contentType]}`;
  if (opts.ipHash) {
    const budget = publicUploadBudget();
    // One statement, so the check and the insert see the same rows.
    const rows = await q(
      `insert into uploads (key, space_id, kind, content_type, size, ip_hash)
       select $1, $2, $3, $4, $5::int, $6
       where (select coalesce(sum(size), 0) from uploads
              where ip_hash = $6 and claimed_at is null and created_at > now() - interval '1 hour') + $5::int <= $7::bigint
         and (select coalesce(sum(size), 0) from uploads
              where space_id = $2 and ip_hash is not null and claimed_at is null and created_at > now() - interval '1 hour') + $5::int <= $8::bigint
       returning key`,
      [key, spaceId, kind, contentType, size, opts.ipHash, budget.ip, budget.space],
    );
    if (!rows.length) return { ok: false as const, error: "Too many uploads. Try again later.", busy: true };
  } else {
    await q("insert into uploads (key, space_id, kind, content_type, size) values ($1, $2, $3, $4, $5)", [
      key,
      spaceId,
      kind,
      contentType,
      size,
    ]);
  }
  const url = await presignPut(key, contentType, size);
  return { ok: true as const, key, url, headers: { "Content-Type": contentType } };
}

// Checks that a key handed back by a browser is an unclaimed upload of this kind, for this space, and that the
// stored object matches what was signed.
export async function verifyUpload(spaceId: string, kind: UploadKind, key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  if (!key.startsWith(`${spacePrefix(spaceId)}${kind}/`) || key.length > 200) throw new UploadError();
  const row = await one<{ size: number; content_type: string; claimed_at: string | null }>(
    "select size, content_type, claimed_at from uploads where key = $1 and space_id = $2 and kind = $3",
    [key, spaceId, kind],
  );
  // A claimed file already belongs to something else: attaching it twice would let one delete remove both.
  if (!row || row.claimed_at) throw new UploadError();
  const stored = await head(key);
  if (!stored || stored.size !== row.size || stored.size > uploadRules(kind, env.maxVideoMb).max) throw new UploadError();
  return key;
}

// The IP hash only served the byte budgets of unclaimed uploads: it goes once a file is claimed.
export async function claimUploads(keys: (string | null | undefined)[], client?: PoolClient) {
  const list = keys.filter((k): k is string => Boolean(k));
  if (!list.length) return;
  const sql = "update uploads set claimed_at = now(), ip_hash = null where key = any($1) and claimed_at is null";
  if (client) await client.query(sql, [list]);
  else await q(sql, [list]);
}

export class UploadError extends Error {
  constructor() {
    super("Upload missing or invalid. Try again.");
  }
}
