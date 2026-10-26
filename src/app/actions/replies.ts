"use server";

import { after } from "next/server";
import { z } from "zod";
import { fail, firstIssue, guard, ok, type Result } from "@/lib/actions";
import { one, q } from "@/lib/db";
import { getOwnedSpace } from "@/lib/data/spaces";
import { replyMail } from "@/lib/mail";
import { enqueue, flushOne } from "@/lib/outbox";
import { rateLimitAll } from "@/lib/rate-limit";
import { audit } from "@/lib/privacy";
import { actionUser } from "@/lib/session";

const message = z.string().trim().min(1, "Write a message").max(5000, "At most 5,000 characters");

// Replies to the person who wrote a testimonial. Sent in the space's name; their answer goes to the signed-in user.
export async function replyToTestimonial(spaceId: string, testimonialId: string, input: string): Promise<Result<{ repliedAt: string }>> {
  return guard(async () => {
    const user = await actionUser();
    const space = await getOwnedSpace(user.id, spaceId);
    if (!space) return fail("Not found");
    if (!/^[0-9A-Za-z]{8,32}$/.test(testimonialId)) return fail("Not found");
    const parsed = message.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    // Per person, and per giver: nobody gets more than a few replies a day from one space.
    const limit = await rateLimitAll([
      [`reply:${user.id}`, 30, 3600],
      [`reply-to:${testimonialId}`, 3, 86400],
      [`reply-space:${spaceId}`, 100, 86400],
    ]);
    if (!limit.ok) return fail("Too many replies. Try again later.");
    const t = await one<{ email: string | null; text: string }>("select email, text from testimonials where id = $1 and space_id = $2", [
      testimonialId,
      spaceId,
    ]);
    if (!t) return fail("Not found");
    if (!t.email) return fail("No email for this testimonial");
    const id = await enqueue(
      replyMail({ to: t.email, space: space.name, message: parsed.data, quote: t.text, replyTo: user.email, senderName: user.name }),
    );
    await q("insert into testimonial_replies (testimonial_id, space_id, user_id, message) values ($1, $2, $3, $4)", [
      testimonialId,
      spaceId,
      user.id,
      parsed.data,
    ]);
    const row = await one<{ replied_at: string }>(
      "update testimonials set replied_at = now() where id = $1 and space_id = $2 returning replied_at",
      [testimonialId, spaceId],
    );
    after(() => flushOne(id).catch(() => {}));
    await audit({ spaceId, actorId: user.id, action: "testimonial.reply", target: testimonialId });
    return ok({ repliedAt: new Date(row!.replied_at).toISOString() });
  });
}
