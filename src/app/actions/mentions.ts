"use server";

import { z } from "zod";
import { fail, guard, ok, refreshWidgets, type Result } from "@/lib/actions";
import { one, q } from "@/lib/db";
import { getOwnedSpace } from "@/lib/data/spaces";
import { listMentions, mentionSettings, type Mention, type MentionCounts, type MentionSettings } from "@/lib/data/mentions";
import { newId } from "@/lib/ids";
import { checkSpace } from "@/lib/import/mentions";
import { rateLimitAll } from "@/lib/rate-limit";
import { emitTestimonialEvent } from "@/lib/webhooks";
import { actionUser } from "@/lib/session";

// Mentions of a space's keywords on Hacker News: keywords and the digest switch, the list, save one as a
// testimonial, dismiss. Each action checks the space, validates input and is rate limited.

async function owned(spaceId: string) {
  const user = await actionUser();
  const space = await getOwnedSpace(user.id, spaceId);
  return { user, space };
}

const limited = async (...limits: [string, number, number][]) => !(await rateLimitAll(limits)).ok;
const TOO_MANY = "Too many at once. Try again later.";

const keywordSchema = z
  .string()
  .trim()
  .min(2, "At least 2 characters")
  .max(60, "At most 60 characters")
  .transform((s) => s.replace(/[\u0000-\u001f"]/g, "").replace(/\s{2,}/g, " "));

const settingsSchema = z.object({
  keywords: z.array(keywordSchema).max(5, "Up to 5 keywords").optional(),
  digest: z.boolean().optional(),
});

export type MentionsState = { settings: MentionSettings; items: Mention[]; counts: MentionCounts };

async function state(spaceId: string, status: Mention["status"]): Promise<MentionsState> {
  const [settings, list] = await Promise.all([mentionSettings(spaceId), listMentions(spaceId, status)]);
  return { settings, ...list };
}

export async function saveMentionSettings(
  spaceId: string,
  input: z.input<typeof settingsSchema>,
  view: Mention["status"] = "new",
): Promise<Result<MentionsState>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the keywords");
    if (await limited([`mentions-settings:${user.id}`, 120, 3600])) return fail(TOO_MANY);
    const before = await mentionSettings(spaceId);
    const keywords = parsed.data.keywords ? [...new Map(parsed.data.keywords.map((k) => [k.toLowerCase(), k])).values()] : null;
    await q(
      `insert into mention_settings (space_id, keywords, digest) values ($1, coalesce($2, '{}'::text[]), coalesce($3, true))
       on conflict (space_id) do update set keywords = coalesce($2, mention_settings.keywords),
         digest = coalesce($3, mention_settings.digest), next_check_at = case when $2 is null then mention_settings.next_check_at else now() end,
         updated_at = now()`,
      [spaceId, keywords, parsed.data.digest ?? null],
    );
    // A new keyword is searched at once (within limits), so the list fills while the owner is here.
    const added = keywords?.some((k) => !before.keywords.map((b) => b.toLowerCase()).includes(k.toLowerCase()));
    if (added && !(await limited([`mentions-check:${spaceId}`, 12, 3600]))) {
      const row = await one<{ space_id: string; keywords: string[]; checked_at: string | null; failures: number }>(
        "select space_id, keywords, checked_at, failures from mention_settings where space_id = $1",
        [spaceId],
      );
      if (row) await checkSpace({ ...row, checked_at: null });
    }
    return ok(await state(spaceId, view));
  });
}

export async function loadMentions(spaceId: string, status: Mention["status"]): Promise<Result<MentionsState>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    const s = z.enum(["new", "saved", "dismissed"]).safeParse(status);
    if (!s.success) return fail("Not found");
    if (await limited([`mentions-read:${user.id}`, 600, 3600])) return fail(TOO_MANY);
    return ok(await state(spaceId, s.data));
  });
}

export async function checkMentionsNow(spaceId: string, view: Mention["status"] = "new"): Promise<Result<MentionsState>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    if (await limited([`mentions-check-user:${user.id}`, 30, 3600], [`mentions-check:${spaceId}`, 12, 3600])) return fail(TOO_MANY);
    const row = await one<{ space_id: string; keywords: string[]; checked_at: string | null; failures: number }>(
      "select space_id, keywords, checked_at, failures from mention_settings where space_id = $1",
      [spaceId],
    );
    if (!row?.keywords.length) return fail("Add a keyword first");
    await checkSpace(row);
    return ok(await state(spaceId, view));
  });
}

const idSchema = z.string().regex(/^[0-9A-Za-z]{8,32}$/);

export async function setMentionStatus(spaceId: string, id: string, status: "new" | "dismissed"): Promise<Result> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    if (!idSchema.safeParse(id).success || !["new", "dismissed"].includes(status)) return fail("Not found");
    if (await limited([`mentions-write:${user.id}`, 600, 3600])) return fail(TOO_MANY);
    const row = await one("update mentions set status = $3 where id = $1 and space_id = $2 and status <> 'saved' returning id", [
      id,
      spaceId,
      status,
    ]);
    return row ? ok(null) : fail("Not found");
  });
}

// Saves a mention as an approved testimonial (source Hacker News, linked to the post).
export async function saveMention(spaceId: string, id: string): Promise<Result<{ testimonialId: string }>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    if (!idSchema.safeParse(id).success) return fail("Not found");
    if (await limited([`mentions-write:${user.id}`, 600, 3600], [`mentions-save:${spaceId}`, 300, 3600])) return fail(TOO_MANY);
    const m = await one<Mention & { posted_at: string }>("select * from mentions where id = $1 and space_id = $2", [id, spaceId]);
    if (!m) return fail("Not found");
    const existing = await one<{ id: string }>("select id from testimonials where space_id = $1 and source_url = $2", [spaceId, m.url]);
    const testimonialId =
      existing?.id ??
      (
        await one<{ id: string }>(
          `insert into testimonials (id, space_id, status, source, source_url, text, name, handle, consent, given_at)
           values ($1, $2, 'approved', $3, $4, $5, $6, $7, true, $8) on conflict do nothing returning id`,
          [
            newId(12),
            spaceId,
            "Hacker News",
            m.url,
            (m.text || m.title).slice(0, 3000),
            m.author.slice(0, 80) || "Anonymous",
            m.author.slice(0, 80) || null,
            m.posted_at,
          ],
        )
      )?.id;
    if (!testimonialId) return fail("Couldn't save it. Try again.");
    if (!existing) await emitTestimonialEvent(spaceId, "testimonial.created", [testimonialId]);
    await q("update mentions set status = 'saved', testimonial_id = $3 where id = $1 and space_id = $2", [id, spaceId, testimonialId]);
    await refreshWidgets(spaceId);
    return ok({ testimonialId });
  });
}
