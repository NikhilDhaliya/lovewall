import "server-only";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { one, q } from "@/lib/db";
import { trash } from "@/lib/data/trash";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";
import { audit } from "@/lib/privacy";
import { rateLimit } from "@/lib/rate-limit";
import { storeRemoteImage } from "@/lib/remote-image";
import type { Space, Testimonial, Widget } from "@/lib/types";
import { httpsUrl, nameSchema, optionalLine, ratingSchema, sourceSchema, tagSchema, textSchema } from "@/lib/validation";
import { emitTestimonialEvent, EVENTS, MAX_HOOKS_PER_SPACE, newSecret, seal, targetSchema } from "@/lib/webhooks";
import type { ErrorCode } from "./http";
import { toApi, toApiWidget, type ApiTestimonial, type ApiWidget } from "./shape";

// What the REST API and the MCP server do, in one place. Every query is scoped by the key's space.

export type Out<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string; status: number };

const done = <T>(data: T): Out<T> => ({ ok: true, data });
const problem = (code: ErrorCode, message: string, status: number): Out<never> => ({ ok: false, code, message, status });
const missing = () => problem("not_found", "Not found", 404);
const invalid = (error: z.ZodError) => {
  const issue = error.issues[0];
  const field = issue?.path.join(".");
  return problem("invalid", field ? `${field}: ${issue.message}` : (issue?.message ?? "Invalid input"), 422);
};

export const ID = z.string().regex(/^[0-9A-Za-z]{8,32}$/, "Not a valid id");

// Widgets cache their testimonials: expire them now (route handlers can't use updateTag).
async function refreshWidgets(spaceId: string) {
  const rows = await q<{ id: string }>("select id from widgets where space_id = $1", [spaceId]);
  for (const r of rows) revalidateTag(`widget:${r.id}`, { expire: 0 });
}

// ---------- Reading ----------

export const listSchema = z.object({
  status: z.enum(["new", "approved", "hidden", "all"]).default("all"),
  q: z.string().trim().max(100).optional(),
  tag: z.string().trim().toLowerCase().max(32).optional(),
  source: z.string().trim().max(32).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  featured: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => v === true || v === "true")
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(120).optional(),
});

export type ListInput = z.input<typeof listSchema>;

const encodeCursor = (t: Testimonial) => Buffer.from(`${new Date(t.created_at).toISOString()}|${t.id}`).toString("base64url");
function decodeCursor(cursor: string): [string, string] | null {
  const [ts, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  return ts && id && !Number.isNaN(Date.parse(ts)) && ID.safeParse(id).success ? [ts, id] : null;
}

// Newest first, keyset-paginated on (created_at, id).
export async function listTestimonials(
  spaceId: string,
  input: unknown,
  withEmail: boolean,
): Promise<Out<{ data: ApiTestimonial[]; next_cursor: string | null }>> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const f = parsed.data;
  const where = ["space_id = $1"];
  const params: unknown[] = [spaceId];
  const add = (sql: (n: string) => string, value: unknown) => {
    params.push(value);
    where.push(sql(`$${params.length}`));
  };
  if (f.status !== "all") add((n) => `status = ${n}`, f.status);
  if (f.source) add((n) => `lower(source) = lower(${n})`, f.source);
  if (f.rating) add((n) => `rating = ${n}`, f.rating);
  if (f.tag) add((n) => `${n} = any(tags)`, f.tag);
  if (f.featured !== undefined) add((n) => `featured = ${n}`, f.featured);
  if (f.q) {
    const term = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    add((n) => `(text ilike ${n} or name ilike ${n} or coalesce(company, '') ilike ${n} or coalesce(title, '') ilike ${n})`, term);
  }
  if (f.cursor) {
    const c = decodeCursor(f.cursor);
    if (!c) return problem("invalid", "cursor: Not a valid cursor", 422);
    params.push(c[0], c[1]);
    where.push(`(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length})`);
  }
  const rows = await q<Testimonial>(
    `select * from testimonials where ${where.join(" and ")} order by created_at desc, id desc limit ${f.limit + 1}`,
    params,
  );
  const page = rows.slice(0, f.limit);
  return done({
    data: page.map((t) => toApi(t, withEmail)),
    next_cursor: rows.length > f.limit && page.length ? encodeCursor(page[page.length - 1]) : null,
  });
}

async function row(spaceId: string, id: string) {
  if (!ID.safeParse(id).success) return null;
  return one<Testimonial>("select * from testimonials where id = $1 and space_id = $2", [id, spaceId]);
}

export async function getTestimonial(spaceId: string, id: string, withEmail: boolean): Promise<Out<ApiTestimonial>> {
  const t = await row(spaceId, id);
  return t ? done(toApi(t, withEmail)) : missing();
}

export async function listTags(spaceId: string): Promise<Out<{ tag: string; count: number }[]>> {
  const rows = await q<{ tag: string; count: number }>(
    "select t as tag, count(*)::int as count from testimonials, unnest(tags) t where space_id = $1 group by t order by count desc, t limit 500",
    [spaceId],
  );
  return done(rows);
}

export async function spaceInfo(spaceId: string) {
  const space = await one<Space>("select * from spaces where id = $1", [spaceId]);
  if (!space) return missing();
  const s = await one<{ new: number; approved: number; hidden: number; total: number; average: string | null; rated: number }>(
    `select count(*) filter (where status = 'new')::int as new, count(*) filter (where status = 'approved')::int as approved,
            count(*) filter (where status = 'hidden')::int as hidden, count(*)::int as total,
            (avg(rating) filter (where status = 'approved'))::numeric(3,2)::text as average,
            count(rating) filter (where status = 'approved')::int as rated
     from testimonials where space_id = $1`,
    [spaceId],
  );
  return done({
    id: space.id,
    name: space.name,
    slug: space.slug,
    website: space.website,
    collect_url: `${env.appUrl}/${space.slug}`,
    inbox_url: `${env.appUrl}/app/${space.id}`,
    counts: { new: s?.new ?? 0, approved: s?.approved ?? 0, hidden: s?.hidden ?? 0, total: s?.total ?? 0 },
    rating: { average: s?.average ? Math.round(Number(s.average) * 10) / 10 : null, count: s?.rated ?? 0 },
  });
}

export async function stats(spaceId: string) {
  const info = await spaceInfo(spaceId);
  if (!info.ok) return info;
  const [sources, recent, tags, featured] = await Promise.all([
    q<{ source: string; count: number }>(
      "select source, count(*)::int as count from testimonials where space_id = $1 group by source order by count desc limit 20",
      [spaceId],
    ),
    one<{ week: number; month: number }>(
      `select count(*) filter (where created_at > now() - interval '7 days')::int as week,
              count(*) filter (where created_at > now() - interval '30 days')::int as month from testimonials where space_id = $1`,
      [spaceId],
    ),
    listTags(spaceId),
    one<{ n: number }>("select count(*)::int as n from testimonials where space_id = $1 and featured", [spaceId]),
  ]);
  return done({
    space: info.data.name,
    counts: { ...info.data.counts, featured: featured?.n ?? 0 },
    rating: info.data.rating,
    new_last_7_days: recent?.week ?? 0,
    new_last_30_days: recent?.month ?? 0,
    sources,
    top_tags: tags.ok ? tags.data.slice(0, 10) : [],
  });
}

export async function listWidgets(spaceId: string): Promise<Out<ApiWidget[]>> {
  const rows = await q<Widget>("select * from widgets where space_id = $1 order by created_at", [spaceId]);
  return done(rows.map(toApiWidget));
}

export async function getWidget(spaceId: string, id: string): Promise<Out<ApiWidget>> {
  if (!ID.safeParse(id).success) return missing();
  const w = await one<Widget>("select * from widgets where id = $1 and space_id = $2", [id, spaceId]);
  return w ? done(toApiWidget(w)) : missing();
}

// ---------- Writing ----------

const handleSchema = optionalLine(60).transform((s) => (s ? s.replace(/^@+/, "") || null : null));
const emailSchema = z
  .union([z.email().max(200), z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);
const urlOrNull = z
  .union([httpsUrl, z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);
const dateSchema = z
  .string()
  .max(40)
  .refine((v) => !Number.isNaN(Date.parse(v)), "Not a valid date")
  .transform((v) => new Date(v).toISOString());
const statusSchema = z.enum(["new", "approved", "hidden"]);
const tagsSchema = z.array(tagSchema).max(20);

export const createSchema = z.object({
  name: nameSchema,
  text: textSchema.pipe(z.string().min(1, "Add the testimonial text")),
  title: optionalLine(80),
  company: optionalLine(80),
  handle: handleSchema,
  email: emailSchema,
  rating: ratingSchema,
  source: sourceSchema.optional().transform((v) => v ?? "API"),
  source_url: urlOrNull,
  avatar_url: urlOrNull,
  given_at: dateSchema.optional().nullable(),
  tags: tagsSchema.optional().transform((v) => [...new Set(v ?? [])]),
  status: statusSchema.default("new"),
  featured: z.boolean().default(false),
});

export type CreateInput = z.input<typeof createSchema>;

export async function createTestimonial(spaceId: string, input: unknown): Promise<Out<ApiTestimonial>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const limit = await rateLimit(`api-create:${spaceId}`, Math.max(env.maxTestimonialsPerDay, 1000), 86400);
  if (!limit.ok) return problem("rate_limited", "Daily limit for new testimonials reached", 429);
  if (d.source_url && (await one("select 1 from testimonials where space_id = $1 and source_url = $2", [spaceId, d.source_url]))) {
    return problem("conflict", "A testimonial with this source_url already exists", 409);
  }
  const avatar = d.avatar_url ? await storeRemoteImage(spaceId, d.avatar_url, "avatar") : null;
  try {
    const t = await one<Testimonial>(
      `insert into testimonials (id, space_id, status, featured, source, source_url, rating, text, name, title, company, handle, email, avatar_key, tags, consent, given_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, true, coalesce($16, now())) returning *`,
      [
        newId(12),
        spaceId,
        d.status,
        d.featured,
        d.source,
        d.source_url,
        d.rating,
        d.text,
        d.name,
        d.title,
        d.company,
        d.handle,
        d.email,
        avatar,
        d.tags,
        d.given_at ?? null,
      ],
    );
    await refreshWidgets(spaceId);
    await emitTestimonialEvent(spaceId, d.status === "approved" ? ["testimonial.created", "testimonial.approved"] : "testimonial.created", [
      t!,
    ]);
    return done(toApi(t!, true));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return problem("conflict", "A testimonial with this source_url already exists", 409);
    throw error;
  }
}

export const updateSchema = z
  .object({
    name: nameSchema,
    text: textSchema,
    title: optionalLine(80),
    company: optionalLine(80),
    handle: handleSchema,
    email: emailSchema,
    rating: ratingSchema,
    source: sourceSchema,
    source_url: urlOrNull,
    given_at: dateSchema,
    tags: tagsSchema.transform((v) => [...new Set(v)]),
    status: statusSchema,
    featured: z.boolean(),
  })
  .partial();

const COLUMNS = [
  "name",
  "text",
  "title",
  "company",
  "handle",
  "email",
  "rating",
  "source",
  "source_url",
  "given_at",
  "tags",
  "status",
  "featured",
] as const;

export async function updateTestimonial(spaceId: string, id: string, input: unknown): Promise<Out<ApiTestimonial>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const current = await row(spaceId, id);
  if (!current) return missing();
  const d = parsed.data;
  // Only the fields that were sent change (absent keys are left alone; null clears optional ones).
  const sent = COLUMNS.filter((c) => c in (input as object) && d[c] !== undefined);
  if (!sent.length) return done(toApi(current, true));
  if ("text" in d && !d.text && !current.video_key) return problem("invalid", "text: Add the testimonial text", 422);
  const sets = sent.map((c, i) => `${c} = $${i + 3}`);
  try {
    const t = await one<Testimonial>(
      `update testimonials set ${sets.join(", ")}, updated_at = now() where id = $1 and space_id = $2 returning *`,
      [id, spaceId, ...sent.map((c) => d[c])],
    );
    await changed(spaceId, [current], [t!]);
    return done(toApi(t!, true));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return problem("conflict", "A testimonial with this source_url already exists", 409);
    throw error;
  }
}

// After a change: refresh widgets, then send testimonial.updated (and .approved for those that just got approved).
async function changed(spaceId: string, before: Testimonial[], after: Testimonial[]) {
  await refreshWidgets(spaceId);
  const was = new Map(before.map((t) => [t.id, t.status]));
  const approved = after.filter((t) => t.status === "approved" && was.get(t.id) !== "approved");
  await emitTestimonialEvent(spaceId, "testimonial.updated", after);
  await emitTestimonialEvent(spaceId, "testimonial.approved", approved);
}

export async function deleteTestimonial(spaceId: string, id: string): Promise<Out<{ id: string; deleted: true }>> {
  if (!ID.safeParse(id).success) return missing();
  const t = await one<Testimonial>("delete from testimonials where id = $1 and space_id = $2 returning *", [id, spaceId]);
  if (!t) return missing();
  await trash([t.avatar_key, t.video_key, t.poster_key, t.image_key, t.company_logo_key]);
  await refreshWidgets(spaceId);
  await emitTestimonialEvent(spaceId, "testimonial.deleted", [t]);
  await audit({ spaceId, actorId: null, actorKind: "api", action: "testimonials.delete", target: id, detail: { count: 1 } });
  return done({ id, deleted: true });
}

export const bulkSchema = z.object({
  ids: z.array(ID).min(1).max(100),
  status: statusSchema.optional(),
  featured: z.boolean().optional(),
  add_tags: tagsSchema.optional(),
  remove_tags: tagsSchema.optional(),
});

// Status, featured and tags for one or many testimonials (the MCP tool and the REST shortcuts use it).
export async function updateMany(spaceId: string, input: unknown): Promise<Out<ApiTestimonial[]>> {
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const before = await q<Testimonial>("select * from testimonials where space_id = $1 and id = any($2)", [spaceId, d.ids]);
  if (!before.length) return missing();
  const after = await q<Testimonial>(
    `update testimonials set
       status = coalesce($3, status),
       featured = coalesce($4, featured),
       tags = case when $5::text[] is null and $6::text[] is null then tags else (
         select coalesce(array_agg(t order by t), '{}') from (
           select distinct t from unnest(array_cat(tags, coalesce($5::text[], '{}'))) t
           where not (t = any(coalesce($6::text[], '{}'))) limit 40) x) end,
       updated_at = now()
     where space_id = $1 and id = any($2) returning *`,
    [spaceId, d.ids, d.status ?? null, d.featured ?? null, d.add_tags ?? null, d.remove_tags ?? null],
  );
  await changed(spaceId, before, after);
  return done(after.map((t) => toApi(t, true)));
}

// ---------- REST Hooks (Zapier, Make) ----------

const subscribeSchema = z.object({
  target_url: targetSchema,
  event: z.enum(EVENTS).default("testimonial.created"),
});

export async function subscribe(key: { id: string; spaceId: string }, input: unknown) {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  // Some clients send `url` / `hookUrl` instead of `target_url`.
  const parsed = subscribeSchema.safeParse({ ...raw, target_url: raw.target_url ?? raw.url ?? raw.hookUrl });
  if (!parsed.success) return invalid(parsed.error);
  const count = await one<{ n: number }>("select count(*)::int as n from webhooks where space_id = $1", [key.spaceId]);
  if ((count?.n ?? 0) >= MAX_HOOKS_PER_SPACE) return problem("conflict", `Up to ${MAX_HOOKS_PER_SPACE} webhooks per space`, 409);
  const hook = await one<{ id: string; created_at: string }>(
    `insert into webhooks (id, space_id, kind, url, events, secret, api_key_id) values ($1, $2, 'rest', $3, $4, $5, $6) returning id, created_at`,
    [newId(12), key.spaceId, parsed.data.target_url, [parsed.data.event], seal(newSecret()), key.id],
  );
  return done({
    id: hook!.id,
    target_url: parsed.data.target_url,
    event: parsed.data.event,
    created_at: new Date(hook!.created_at).toISOString(),
  });
}

export async function unsubscribe(spaceId: string, id: string): Promise<Out<{ id: string; deleted: true }>> {
  if (!ID.safeParse(id).success) return missing();
  const gone = await one("delete from webhooks where id = $1 and space_id = $2 and kind = 'rest' returning id", [id, spaceId]);
  return gone ? done({ id, deleted: true }) : missing();
}
