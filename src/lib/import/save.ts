import "server-only";
import { tx } from "@/lib/db";
import { newId } from "@/lib/ids";
import type { Status, Testimonial } from "@/lib/types";
import { emitTestimonialEvent } from "@/lib/webhooks";
import type { Found } from "./types";

// Found reviews become testimonials. Each has a stable source_url, and (space, source_url) is unique, so a review
// that is already in the space is skipped, however many times it is imported or synced. recheck: an oEmbed post,
// looked up again every week (recheck.ts).

export async function insertFound(
  spaceId: string,
  source: string,
  items: Found[],
  statusOf: (f: Found) => Status,
  recheck = false,
): Promise<{ saved: Testimonial[]; skipped: number }> {
  const saved: Testimonial[] = [];
  await tx(async (c) => {
    for (const f of items) {
      const res = await c.query<Testimonial>(
        `insert into testimonials (id, space_id, status, source, source_url, rating, text, name, title, company, handle, consent, given_at,
           checked_at, source_hash)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, coalesce($12, now()),
           case when $13 then now() end, case when $13 then md5($8 || E'\\n' || $7) end)
         on conflict do nothing returning *`,
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
          recheck,
        ],
      );
      if (res.rows[0]) saved.push(res.rows[0]);
    }
  });
  await emitTestimonialEvent(spaceId, "testimonial.created", saved);
  return { saved, skipped: items.length - saved.length };
}

// The newest review date among these, for the sync watermark.
export function newest(items: Found[]): string | null {
  let max: string | null = null;
  for (const f of items) if (f.date && (!max || f.date > max)) max = f.date;
  return max;
}
