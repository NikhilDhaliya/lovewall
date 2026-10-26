"use server";

import { z } from "zod";
import { fail, limitUser, firstIssue, guard, ok, refreshWidgets, type Result } from "@/lib/actions";
import { queueTranslations } from "@/lib/ai/jobs";
import { one, q, tx } from "@/lib/db";
import { claimUploads, verifyUpload } from "@/lib/data/files";
import { getOwnedSpace } from "@/lib/data/spaces";
import { inboxMeta, queryInbox, toOwner, type InboxFilters, type InboxPage, type OwnerTestimonial } from "@/lib/data/testimonials";
import { trash } from "@/lib/data/trash";
import { newId } from "@/lib/ids";
import { copyRemote } from "@/lib/import/media";
import { rateLimit, rateLimitAll } from "@/lib/rate-limit";
import { audit } from "@/lib/privacy";
import { actionUser } from "@/lib/session";
import { storageConfigured } from "@/lib/storage";
import { sourceLabel } from "@/lib/sources";
import type { Testimonial } from "@/lib/types";
import { httpsUrl, nameSchema, optionalLine, ratingSchema, sourceSchema, tagSchema, textSchema, type UploadKind } from "@/lib/validation";
import { emitTestimonialEvent } from "@/lib/webhooks";
import { fetchTweet, ImportError } from "@/lib/x-import";
import type { MediaJob } from "./import";

const idList = z
  .array(z.string().regex(/^[0-9A-Za-z]{8,32}$/))
  .min(1)
  .max(500);

async function owned(spaceId: string) {
  const user = await actionUser();
  await limitUser(user.id);
  const space = await getOwnedSpace(user.id, spaceId);
  return { user, space };
}

const filtersSchema = z.object({
  status: z.enum(["new", "approved", "hidden", "all"]).catch("new"),
  source: z.string().max(40).nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  tag: z.string().max(40).nullable().optional(),
  q: z.string().max(100).nullable().optional(),
  form: z
    .string()
    .regex(/^[0-9A-Za-z]{8,32}$/)
    .nullable()
    .optional()
    .catch(null),
});

export async function listTestimonials(
  spaceId: string,
  filters: InboxFilters,
  cursor?: string | null,
): Promise<Result<InboxPage & { meta: Awaited<ReturnType<typeof inboxMeta>> | null }>> {
  return guard(async () => {
    const { space } = await owned(spaceId);
    if (!space) return fail("Not found");
    const f = filtersSchema.parse(filters);
    const page = await queryInbox(spaceId, f, cursor ? String(cursor).slice(0, 80) : null);
    return ok({ ...page, meta: cursor ? null : await inboxMeta(spaceId) });
  });
}

export async function setStatus(spaceId: string, ids: string[], status: "new" | "approved" | "hidden"): Promise<Result<{ count: number }>> {
  return guard(async () => {
    const { space } = await owned(spaceId);
    if (!space) return fail("Not found");
    const list = idList.safeParse(ids);
    const s = z.enum(["new", "approved", "hidden"]).safeParse(status);
    if (!list.success || !s.success) return fail("Nothing to change");
    // Approving or restoring something the spam filter caught clears the flag (the owner says it isn't spam).
    const rows = await q(
      `update testimonials set status = $3, spam = case when $3 = 'hidden' then spam else false end, updated_at = now()
       where space_id = $1 and id = any($2) returning id`,
      [spaceId, list.data, s.data],
    );
    await refreshWidgets(spaceId);
    // Widgets shown in another language get translations of newly approved testimonials (AI, when a key is set).
    if (s.data === "approved") await queueTranslations(spaceId);
    await emitTestimonialEvent(
      spaceId,
      s.data === "approved" ? ["testimonial.updated", "testimonial.approved"] : "testimonial.updated",
      rows.map((r) => r.id),
    );
    return ok({ count: rows.length });
  });
}

export async function setFeatured(spaceId: string, ids: string[], featured: boolean): Promise<Result<{ count: number }>> {
  return guard(async () => {
    const { space } = await owned(spaceId);
    if (!space) return fail("Not found");
    const list = idList.safeParse(ids);
    if (!list.success) return fail("Nothing to change");
    const rows = await q("update testimonials set featured = $3, updated_at = now() where space_id = $1 and id = any($2) returning id", [
      spaceId,
      list.data,
      Boolean(featured),
    ]);
    await refreshWidgets(spaceId);
    await emitTestimonialEvent(
      spaceId,
      "testimonial.updated",
      rows.map((r) => r.id),
    );
    return ok({ count: rows.length });
  });
}

export async function changeTags(
  spaceId: string,
  ids: string[],
  change: { add?: string[]; remove?: string[] },
): Promise<Result<{ count: number }>> {
  return guard(async () => {
    const { space } = await owned(spaceId);
    if (!space) return fail("Not found");
    const list = idList.safeParse(ids);
    const add = z
      .array(tagSchema)
      .max(10)
      .safeParse(change.add ?? []);
    const remove = z
      .array(tagSchema)
      .max(10)
      .safeParse(change.remove ?? []);
    if (!list.success) return fail("Nothing to change");
    if (!add.success || !remove.success) return fail("Tags: letters, numbers and dashes, up to 32 characters");
    const rows = await q(
      `update testimonials set tags = (
         select coalesce(array_agg(distinct t order by t), '{}') from unnest(array_cat(tags, $3::text[])) t where not (t = any($4::text[]))
       ), updated_at = now()
       where space_id = $1 and id = any($2) and cardinality(tags) < 40 returning id`,
      [spaceId, list.data, add.data, remove.data],
    );
    await refreshWidgets(spaceId);
    await emitTestimonialEvent(
      spaceId,
      "testimonial.updated",
      rows.map((r) => r.id),
    );
    return ok({ count: rows.length });
  });
}

export async function deleteTestimonials(spaceId: string, ids: string[]): Promise<Result<{ count: number }>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    const list = idList.safeParse(ids);
    if (!list.success) return fail("Nothing to delete");
    const rows = await q<Testimonial>("delete from testimonials where space_id = $1 and id = any($2) returning *", [spaceId, list.data]);
    await trash(rows.flatMap((r) => [r.avatar_key, r.video_key, r.poster_key, r.image_key, r.company_logo_key]));
    await refreshWidgets(spaceId);
    await emitTestimonialEvent(spaceId, "testimonial.deleted", rows);
    await audit({
      spaceId,
      actorId: user.id,
      action: "testimonials.delete",
      target: rows.length === 1 ? rows[0].id : null,
      detail: { count: rows.length },
    });
    return ok({ count: rows.length });
  });
}

const editSchema = z.object({
  // Optional only for image testimonials (a screenshot shows who wrote it).
  name: optionalLine(80),
  text: textSchema,
  title: optionalLine(80),
  company: optionalLine(80),
  rating: ratingSchema,
  source: sourceSchema,
  source_url: z
    .union([httpsUrl, z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
  given_at: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null)),
  avatar_key: z.string().max(200).nullable().optional(),
  tags: z.array(tagSchema).max(20).optional(),
  status: z.enum(["new", "approved", "hidden"]).optional(),
  // The company's logo, an image testimonial (screenshot), a new poster frame, and the trimmed range of the video.
  company_logo_key: z.string().max(200).nullable().optional(),
  image_key: z.string().max(200).nullable().optional(),
  poster_key: z.string().max(200).optional(),
  video_start: z.number().min(0).max(36_000).nullable().optional(),
  video_end: z.number().min(0).max(36_000).nullable().optional(),
});

// A file the sheet sends: unchanged (undefined), removed (null), or a new upload of this kind, checked and claimed.
async function nextKey(spaceId: string, kind: UploadKind, given: string | null | undefined, current: string | null | undefined) {
  if (given === undefined) return current ?? null;
  if (given && given !== current) await verifyUpload(spaceId, kind, given);
  return given;
}

export type TestimonialInput = z.input<typeof editSchema>;

export async function updateTestimonial(spaceId: string, id: string, input: TestimonialInput): Promise<Result<OwnerTestimonial>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    const parsed = editSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const d = parsed.data;
    const current = await one<Testimonial>("select * from testimonials where id = $1 and space_id = $2", [id, spaceId]);
    if (!current) return fail("Not found");
    const avatar = await nextKey(spaceId, "avatar", d.avatar_key, current.avatar_key);
    const logo = await nextKey(spaceId, "logo", d.company_logo_key, current.company_logo_key);
    const image = await nextKey(spaceId, "image", d.image_key, current.image_key);
    const poster = current.video_key ? await nextKey(spaceId, "poster", d.poster_key, current.poster_key) : current.poster_key;
    if (!d.name && !image) return fail("Add a name");
    if (!d.text && !current.video_key && !image) return fail("Add the testimonial text");
    // Trim: both ends inside the video, at least half a second long; the full length is stored as no trim.
    let start = d.video_start === undefined ? (current.video_start ?? null) : d.video_start;
    let end = d.video_end === undefined ? (current.video_end ?? null) : d.video_end;
    if (!current.video_key) start = end = null;
    if (start !== null && start <= 0.05) start = null;
    if (end !== null && end - (start ?? 0) < 0.5) return fail("Keep at least half a second");
    const row = await one<Testimonial>(
      `update testimonials set name = $3, text = $4, title = $5, company = $6, rating = $7, source = $8, source_url = $9,
         given_at = coalesce($10, given_at), avatar_key = $11, tags = coalesce($12, tags), status = coalesce($13, status),
         company_logo_key = $14, image_key = $15, poster_key = $16, video_start = $17, video_end = $18, updated_at = now()
       where id = $1 and space_id = $2 returning *`,
      [
        id,
        spaceId,
        d.name ?? "",
        d.text,
        d.title,
        d.company,
        d.rating,
        d.source,
        d.source_url,
        d.given_at,
        avatar,
        d.tags ?? null,
        d.status ?? null,
        logo,
        image,
        poster,
        start,
        end,
      ],
    );
    const replaced = (
      [
        [avatar, current.avatar_key],
        [logo, current.company_logo_key],
        [image, current.image_key],
        [poster, current.poster_key],
      ] as const
    ).filter(([next, prev]) => next !== (prev ?? null));
    if (replaced.length) {
      await claimUploads(replaced.map(([next]) => next));
      await trash(replaced.map(([, prev]) => prev));
    }
    if (image !== current.image_key) {
      await claimUploads([image]);
      await trash([current.image_key]);
    }
    await refreshWidgets(spaceId);
    await audit({ spaceId, actorId: user.id, action: "testimonial.edit", target: id });
    await emitTestimonialEvent(
      spaceId,
      ["testimonial.updated", ...(row!.status !== current.status && row!.status === "approved" ? (["testimonial.approved"] as const) : [])],
      [row!],
    );
    return ok(toOwner(row!));
  });
}

export async function addTestimonial(spaceId: string, input: TestimonialInput): Promise<Result<OwnerTestimonial>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    const parsed = editSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const d = parsed.data;
    if (!d.name && !d.image_key) return fail("Add a name");
    if (!d.text && !d.image_key) return fail("Add the testimonial text");
    const limit = await rateLimit(`manual-add:${user.id}`, 300, 3600);
    if (!limit.ok) return fail("Too many at once. Try again later.");
    const avatar = d.avatar_key ? await verifyUpload(spaceId, "avatar", d.avatar_key) : null;
    const logo = d.company_logo_key ? await verifyUpload(spaceId, "logo", d.company_logo_key) : null;
    const image = d.image_key ? await verifyUpload(spaceId, "image", d.image_key) : null;
    try {
      const row = await one<Testimonial>(
        `insert into testimonials (id, space_id, status, source, source_url, rating, text, name, title, company, avatar_key, tags, consent, given_at,
           company_logo_key, image_key)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, coalesce($13, now()), $14, $15) returning *`,
        [
          newId(12),
          spaceId,
          d.status ?? "approved",
          d.source,
          d.source_url,
          d.rating,
          d.text,
          d.name ?? "",
          d.title,
          d.company,
          avatar,
          d.tags ?? [],
          d.given_at,
          logo,
          image,
        ],
      );
      await claimUploads([avatar, logo, image]);
      await refreshWidgets(spaceId);
      await emitTestimonialEvent(
        spaceId,
        row!.status === "approved" ? ["testimonial.created", "testimonial.approved"] : "testimonial.created",
        [row!],
      );
      return ok(toOwner(row!));
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return fail("That link is already in this space");
      throw error;
    }
  });
}

export async function importFromX(spaceId: string, url: string): Promise<Result<OwnerTestimonial>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    const limit = await rateLimit(`x-import:${user.id}`, 60, 3600);
    if (!limit.ok) return fail("Too many imports. Try again later.");
    let tweet;
    try {
      tweet = await fetchTweet(String(url).slice(0, 500));
    } catch (error) {
      return fail(error instanceof ImportError ? error.message : "Couldn't import that post");
    }
    if (!tweet.text) return fail("That post has no text");
    const exists = await one("select 1 from testimonials where space_id = $1 and source_url = $2", [spaceId, tweet.url]);
    if (exists) return fail("Already imported");
    const avatar = await copyRemote(spaceId, tweet.avatarUrl, "avatar");
    try {
      const row = await one<Testimonial>(
        `insert into testimonials (id, space_id, status, source, source_url, text, name, handle, avatar_key, consent, given_at)
         values ($1, $2, 'approved', 'X', $3, $4, $5, $6, $7, true, coalesce($8, now())) returning *`,
        [newId(12), spaceId, tweet.url, tweet.text.slice(0, 3000), tweet.name, tweet.handle, avatar, tweet.date],
      );
      await refreshWidgets(spaceId);
      await emitTestimonialEvent(
        spaceId,
        row!.status === "approved" ? ["testimonial.created", "testimonial.approved"] : "testimonial.created",
        [row!],
      );
      return ok(toOwner(row!));
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return fail("Already imported");
      throw error;
    }
  });
}

const csvRow = z.object({
  name: z.string().optional(),
  text: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  rating: z.string().optional(),
  source: z.string().optional(),
  url: z.string().optional(),
  date: z.string().optional(),
  avatar: z.string().optional(),
  email: z.string().optional(),
  tags: z.string().optional(),
  image: z.string().optional(),
  video: z.string().optional(),
  poster: z.string().optional(),
  handle: z.string().optional(),
});

const mediaUrl = (v: string | undefined) => (v && httpsUrl.safeParse(v).success ? v.trim() : undefined);

// Rows are added at once; their files (avatars, screenshots, videos from a Senja or Testimonial.to export) come back
// as `media` for the sheet to copy a few at a time (copyMedia), so this stays fast however big the export is.
export async function importCsv(
  spaceId: string,
  rows: unknown[],
  defaults: { source?: string; status?: "new" | "approved" },
): Promise<Result<{ added: number; skipped: number; media: MediaJob[] }>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    if (!Array.isArray(rows) || rows.length === 0) return fail("No rows to import");
    if (rows.length > 1000) return fail("Up to 1,000 rows at a time");
    const limit = await rateLimitAll([
      [`csv-import:${user.id}`, 20, 3600],
      [`csv-import-space:${spaceId}`, 30, 3600],
    ]);
    if (!limit.ok) return fail("Too many imports. Try again later.");
    const status = defaults.status === "new" ? "new" : "approved";
    const fallbackSource = sourceSchema.parse(defaults.source || "CSV");
    let skipped = 0;
    const valid: { id: string; media: Omit<MediaJob, "id">; values: unknown[] }[] = [];
    for (const raw of rows) {
      const r = csvRow.safeParse(raw);
      if (!r.success) {
        skipped++;
        continue;
      }
      const rating = r.data.rating ? Math.round(Number(String(r.data.rating).replace(",", "."))) : null;
      const url = r.data.url && httpsUrl.safeParse(r.data.url).success ? r.data.url.trim() : null;
      const tags = (r.data.tags ?? "")
        .split(/[,;|]/)
        .map((t) => tagSchema.safeParse(t))
        .filter((t) => t.success)
        .map((t) => t.data!)
        .slice(0, 10);
      const video = mediaUrl(r.data.video);
      const parsed = z
        .object({
          name: nameSchema,
          // A video testimonial may have no text.
          text: video ? textSchema : textSchema.pipe(z.string().min(1)),
          title: optionalLine(80),
          company: optionalLine(80),
          handle: optionalLine(80),
          source: sourceSchema,
        })
        .safeParse({
          name: r.data.name ?? "",
          text: r.data.text ?? "",
          title: r.data.title,
          company: r.data.company,
          handle: r.data.handle?.replace(/^@/, ""),
          source: sourceLabel(r.data.source || fallbackSource),
        });
      if (!parsed.success) {
        skipped++;
        continue;
      }
      const date = r.data.date && !Number.isNaN(Date.parse(r.data.date)) ? new Date(r.data.date).toISOString() : null;
      const email = r.data.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.data.email.trim()) ? r.data.email.trim().slice(0, 200) : null;
      const id = newId(12);
      valid.push({
        id,
        media: {
          avatar: mediaUrl(r.data.avatar),
          image: mediaUrl(r.data.image),
          video,
          poster: video ? mediaUrl(r.data.poster) : undefined,
        },
        values: [
          id,
          spaceId,
          status,
          parsed.data.source,
          url,
          rating && rating >= 1 && rating <= 5 ? rating : null,
          parsed.data.text,
          parsed.data.name,
          parsed.data.title,
          parsed.data.company,
          email,
          tags,
          date,
          parsed.data.handle,
        ],
      });
    }
    let added = 0;
    const addedIds: string[] = [];
    const media: MediaJob[] = [];
    await tx(async (c) => {
      for (const v of valid) {
        // Duplicates: the same link, or (without one) the same person and words, or for a video without words the same
        // person and time, already in this space.
        const res = await c.query(
          `insert into testimonials (id, space_id, status, source, source_url, rating, text, name, title, company, email, tags, consent, given_at, handle)
           select $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, coalesce($13, now()), $14
           where $5::text is not null or not exists (
             select 1 from testimonials where space_id = $2 and name = $8 and text = $7
               and ($7 <> '' or ($13::timestamptz is not null and given_at = $13::timestamptz)))
           on conflict do nothing`,
          v.values,
        );
        if (!res.rowCount) {
          skipped++;
          continue;
        }
        added++;
        addedIds.push(v.id);
        if (v.media.avatar || v.media.image || v.media.video) media.push({ id: v.id, ...v.media });
      }
    });
    await refreshWidgets(spaceId);
    await emitTestimonialEvent(spaceId, "testimonial.created", addedIds);
    return ok({ added, skipped, media: storageConfigured() ? media.slice(0, 1000) : [] });
  });
}
