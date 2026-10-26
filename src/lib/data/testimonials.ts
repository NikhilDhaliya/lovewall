import "server-only";
import { one, q } from "@/lib/db";
import type { Status, Testimonial } from "@/lib/types";
import { fileUrl } from "./files";

export type OwnerTestimonial = Testimonial & {
  avatar: string | null;
  video: string | null;
  poster: string | null;
  image: string | null;
  // From collect forms (migration 0020): the visitor's website and when the owner last replied by email.
  website?: string | null;
  replied_at?: string | null;
  company_logo: string | null;
};

export function toOwner(t: Testimonial): OwnerTestimonial {
  return {
    ...t,
    given_at: new Date(t.given_at).toISOString(),
    created_at: new Date(t.created_at).toISOString(),
    updated_at: new Date(t.updated_at).toISOString(),
    replied_at: (t as OwnerTestimonial).replied_at ? new Date((t as OwnerTestimonial).replied_at!).toISOString() : null,
    avatar: fileUrl(t.avatar_key),
    video: fileUrl(t.video_key),
    poster: fileUrl(t.poster_key),
    image: fileUrl(t.image_key),
    company_logo: fileUrl(t.company_logo_key),
  };
}

export type InboxFilters = {
  status: Status | "all";
  source?: string | null;
  rating?: number | null;
  tag?: string | null;
  q?: string | null;
  form?: string | null;
};

export type InboxPage = { items: OwnerTestimonial[]; next: string | null };

export const PAGE_SIZE = 50;

// Newest first, keyset-paginated on (created_at, id).
export async function queryInbox(spaceId: string, f: InboxFilters, cursor?: string | null): Promise<InboxPage> {
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
  if (f.form) add((n) => `form_id = ${n}`, f.form);
  if (f.q?.trim()) {
    const term = `%${f.q
      .trim()
      .slice(0, 100)
      .replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    add((n) => `(text ilike ${n} or name ilike ${n} or coalesce(company, '') ilike ${n} or coalesce(title, '') ilike ${n})`, term);
  }
  if (cursor) {
    const [ts, id] = cursor.split("|");
    if (ts && id && !Number.isNaN(Date.parse(ts))) {
      params.push(ts, id);
      where.push(`(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length})`);
    }
  }
  const rows = await q<Testimonial>(
    `select * from testimonials where ${where.join(" and ")} order by created_at desc, id desc limit ${PAGE_SIZE + 1}`,
    params,
  );
  const page = rows.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    items: page.map(toOwner),
    next: rows.length > PAGE_SIZE && last ? `${new Date(last.created_at).toISOString()}|${last.id}` : null,
  };
}

export async function inboxMeta(spaceId: string) {
  const counts = await one<{ new: number; approved: number; hidden: number; all: number }>(
    `select count(*) filter (where status = 'new')::int as new, count(*) filter (where status = 'approved')::int as approved,
            count(*) filter (where status = 'hidden')::int as hidden, count(*)::int as all
     from testimonials where space_id = $1`,
    [spaceId],
  );
  const tags = await q<{ tag: string }>("select distinct unnest(tags) as tag from testimonials where space_id = $1 order by 1 limit 200", [
    spaceId,
  ]);
  const sources = await q<{ source: string }>("select distinct source from testimonials where space_id = $1 order by 1 limit 50", [
    spaceId,
  ]);
  return {
    counts: counts ?? { new: 0, approved: 0, hidden: 0, all: 0 },
    tags: tags.map((r) => r.tag),
    sources: sources.map((r) => r.source),
  };
}
