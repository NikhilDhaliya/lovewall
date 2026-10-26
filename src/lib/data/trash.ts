import "server-only";
import { after } from "next/server";
import { q } from "@/lib/db";
import { deleteKeys, deletePrefix, storageConfigured } from "@/lib/storage";

// Files to delete from storage. Queued in Postgres first so a storage outage can't leave orphans: deleted right
// after the response, and the maintenance cron retries anything left.
export async function trash(paths: (string | null | undefined)[]) {
  const list = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (!list.length) return;
  await q("insert into storage_trash (prefix) select unnest($1::text[]) on conflict do nothing", [list]);
  after(() => emptyTrash(list).catch(() => {}));
}

export async function emptyTrash(only?: string[]) {
  if (!storageConfigured()) return { removed: 0 };
  const rows = only
    ? only.map((prefix) => ({ prefix }))
    : await q<{ prefix: string }>(
        "update storage_trash set attempts = attempts + 1 where prefix in (select prefix from storage_trash where attempts < 20 order by created_at limit 50) returning prefix",
      );
  let removed = 0;
  for (const { prefix } of rows) {
    try {
      if (prefix.endsWith("/")) await deletePrefix(prefix);
      else await deleteKeys([prefix]);
      await q("delete from storage_trash where prefix = $1", [prefix]);
      await q("delete from uploads where key = $1 or ($2 and key like $1 || '%')", [prefix, prefix.endsWith("/")]);
      removed++;
    } catch {
      // Left for the next cron run.
    }
  }
  return { removed };
}
