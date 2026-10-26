"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { fail, guard, ok, type Result } from "@/lib/actions";
import { one } from "@/lib/db";
import { ipKey } from "@/lib/ip";
import { audit, expireWidgets, findByGiverToken, removeTestimonials } from "@/lib/privacy";
import { rateLimitAll } from "@/lib/rate-limit";
import { hashToken } from "@/lib/tokens";
import type { Status, Testimonial } from "@/lib/types";
import { optionalLine, ratingSchema, textSchema } from "@/lib/validation";
import { emitTestimonialEvent } from "@/lib/webhooks";

// A giver's own testimonial, through the private link in their receipt email. No account: the link is the key
// (random, stored hashed, expires after a year). Limited per link and per visitor.

async function limited(token: string) {
  const ip = ipKey(await headers());
  const limit = await rateLimitAll([
    [`giver:${hashToken(String(token)).slice(0, 22)}`, 30, 3600],
    [`giver:ip:${ip}`, 60, 3600],
  ]);
  return !limit.ok;
}

const editSchema = z.object({
  name: optionalLine(80),
  title: optionalLine(80),
  company: optionalLine(80),
  text: textSchema,
  rating: ratingSchema,
});

export type GiverEdit = z.input<typeof editSchema>;

export async function updateMyTestimonial(token: string, input: GiverEdit): Promise<Result<{ status: Status }>> {
  return guard(async () => {
    if (await limited(token)) return fail("Too many tries. Try again later.");
    const view = await findByGiverToken(token);
    if (!view) return fail("This link has expired");
    const parsed = editSchema.safeParse(input);
    if (!parsed.success) return fail("Check the fields and try again");
    const d = parsed.data;
    const t = view.testimonial;
    if (!d.text && !t.video_key && !t.image_key) return fail("Write a few words");
    const changed =
      (d.name || "Anonymous") !== t.name ||
      d.title !== (t.title ?? null) ||
      d.company !== (t.company ?? null) ||
      d.text !== t.text ||
      (d.rating ?? null) !== (t.rating ?? null);
    if (!changed) return ok({ status: t.status });
    // A published testimonial goes back to review: the business approved the old words, not the new ones.
    const row = await one<Testimonial>(
      `update testimonials set name = $3, title = $4, company = $5, text = $6, rating = $7,
         status = case when status = 'approved' then 'new' else status end, updated_at = now()
       where id = $1 and space_id = $2 returning *`,
      [t.id, view.space.id, d.name || "Anonymous", d.title, d.company, d.text, d.rating ?? null],
    );
    if (!row) return fail("This link has expired");
    await expireWidgets(view.space.id);
    await emitTestimonialEvent(view.space.id, "testimonial.updated", [row]);
    await audit({ spaceId: view.space.id, actorId: null, actorKind: "giver", action: "giver.edit", target: t.id });
    return ok({ status: row.status });
  });
}

export async function deleteMyTestimonial(token: string): Promise<Result> {
  return guard(async () => {
    if (await limited(token)) return fail("Too many tries. Try again later.");
    const view = await findByGiverToken(token);
    if (!view) return fail("This link has expired");
    await removeTestimonials(view.space.id, [view.testimonial.id]);
    await audit({ spaceId: view.space.id, actorId: null, actorKind: "giver", action: "giver.delete", target: view.testimonial.id });
    return ok(null);
  });
}
