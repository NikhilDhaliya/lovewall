import "server-only";
import { q, tx } from "@/lib/db";
import { newId } from "@/lib/ids";
import type { Status, Testimonial } from "@/lib/types";
import { emitTestimonialEvent } from "@/lib/webhooks";
import { copyRemote } from "./media";
import type { Found } from "./types";

// Found reviews become testimonials. Each has a stable source_url, and (space, source_url) is unique, so a review
// that is already in the space is skipped, however many times it is imported or synced.

export type Saved = { row: Testimonial; found: Found };

export async function insertFound(
  spaceId: string,
  source: string,
  items: Found[],
  statusOf: (f: Found) => Status,
): Promise<{ saved: Saved[]; skipped: number }> {
  const saved: Saved[] = [];
  await tx(async (c) => {
    for (const f of items) {
      const res = await c.query<Testimonial>(
        `insert into testimonials (id, space_id, status, source, source_url, rating, text, name, title, company, handle, consent, given_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, coalesce($12, now())) on conflict do nothing returning *`,
        [
          newId(12),
          spaceId,
          statusOf(f),
          source,
          f.url,
          f.rating,
          f.text,
          f.name,
          f.title ?? null,
          f.company ?? null,
          f.handle ? f.handle.replace(/^@/, "").slice(0, 80) : null,
          f.date,
        ],
      );
      if (res.rows[0]) saved.push({ row: res.rows[0], found: f });
    }
  });
  await emitTestimonialEvent(
    spaceId,
    "testimonial.created",
    saved.map((s) => s.row),
  );
  return { saved, skipped: items.length - saved.length };
}

// Avatars and thumbnails are copied into storage, one by one (best effort, capped).
export async function attachMedia(spaceId: string, saved: Saved[], max = 60) {
  let done = 0;
  for (const { row, found } of saved) {
    if (done >= max) break;
    if (!found.avatarUrl && !found.imageUrl) continue;
    done++;
    const avatar = await copyRemote(spaceId, found.avatarUrl, "avatar");
    const image = await copyRemote(spaceId, found.imageUrl, "image");
    if (avatar || image)
      await q(
        "update testimonials set avatar_key = coalesce(avatar_key, $3), image_key = coalesce(image_key, $4) where id = $1 and space_id = $2",
        [row.id, spaceId, avatar, image],
      );
  }
}

// The newest review date among these, for the sync watermark.
export function newest(items: Found[]): string | null {
  let max: string | null = null;
  for (const f of items) if (f.date && (!max || f.date > max)) max = f.date;
  return max;
}
