import "server-only";
import { q } from "@/lib/db";
import { expireWidgets, removeTestimonials } from "@/lib/privacy";
import { sourceOf } from "@/lib/sources";
import { importerFor } from "./index";
import { GoneError } from "./types";

// Posts imported through oEmbed (X, YouTube, TikTok) are looked up again every week, as those platforms ask: a
// testimonial whose post is deleted or private is removed, and one the owner hasn't edited follows edits to the post.
// A lookup that fails for another reason (network, rate limit) is tried again the next day.

type Row = { id: string; space_id: string; source: string; source_url: string | null; source_hash: string | null; hash: string };

export async function recheckDue(limit = 20, budgetMs = 15_000) {
  const started = Date.now();
  const rows = await q<Row>(
    `update testimonials set checked_at = now() where id in (
       select id from testimonials where checked_at < now() - interval '7 days' order by checked_at limit $1 for update skip locked)
     returning id, space_id, source, source_url, source_hash, md5(name || E'\\n' || text) as hash`,
    [limit],
  );
  const gone = new Map<string, string[]>();
  const changed = new Set<string>();
  let checked = 0;
  for (const row of rows) {
    const id = sourceOf(row.source)?.id;
    const importer = id && sourceOf(row.source)?.recheck ? importerFor(id) : null;
    if (!importer || !row.source_url) {
      await q("update testimonials set checked_at = null where id = $1", [row.id]);
      continue;
    }
    if (Date.now() - started > budgetMs) {
      await q("update testimonials set checked_at = now() - interval '7 days' where id = $1", [row.id]);
      continue;
    }
    try {
      const found = (await importer.fetch(row.source_url)).items[0];
      checked++;
      // Unchanged by the owner since the last lookup: take the post's current wording.
      if (found && row.hash === row.source_hash) {
        const updated = await q(
          `update testimonials set name = $2, handle = coalesce($3, handle), text = $4, source_hash = md5($2 || E'\\n' || $4),
             updated_at = now()
           where id = $1 and (name <> $2 or text <> $4) returning id`,
          [row.id, found.name, found.handle ? found.handle.replace(/^@/, "").slice(0, 80) : null, found.text],
        );
        if (updated.length) changed.add(row.space_id);
      }
    } catch (error) {
      if (error instanceof GoneError) gone.set(row.space_id, [...(gone.get(row.space_id) ?? []), row.id]);
      else await q("update testimonials set checked_at = now() - interval '6 days' where id = $1", [row.id]);
    }
  }
  let removed = 0;
  for (const [spaceId, ids] of gone) removed += (await removeTestimonials(spaceId, ids)).length;
  for (const spaceId of changed) if (!gone.has(spaceId)) await expireWidgets(spaceId);
  return { checked, removed, changed: changed.size };
}
