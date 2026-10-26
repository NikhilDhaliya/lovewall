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

// Records the upload and returns a PUT URL that accepts exactly this type and size.
export async function createUpload(spaceId: string, kind: UploadKind, contentType: string, size: number) {
  const rules = uploadRules(kind, env.maxVideoMb);
  if (!rules.types.includes(contentType)) return { ok: false as const, error: "That file type isn't supported" };
  if (!Number.isInteger(size) || size <= 0) return { ok: false as const, error: "Empty file" };
  if (size > rules.max) return { ok: false as const, error: `Too large (max ${Math.round(rules.max / 1024 / 1024)} MB)` };
  const key = `${spacePrefix(spaceId)}${kind}/${newId(16)}.${EXT[contentType]}`;
  await q("insert into uploads (key, space_id, kind, content_type, size) values ($1, $2, $3, $4, $5)", [
    key,
    spaceId,
    kind,
    contentType,
    size,
  ]);
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

export async function claimUploads(keys: (string | null | undefined)[], client?: PoolClient) {
  const list = keys.filter((k): k is string => Boolean(k));
  if (!list.length) return;
  const sql = "update uploads set claimed_at = now() where key = any($1) and claimed_at is null";
  if (client) await client.query(sql, [list]);
  else await q(sql, [list]);
}

export class UploadError extends Error {
  constructor() {
    super("Upload missing or invalid. Try again.");
  }
}
