import "server-only";
import { unstable_cache } from "next/cache";
import { translationsFor } from "@/lib/ai/translate";
import { one, q } from "@/lib/db";
import { env } from "@/lib/env";
import type { PublicSpace, PublicTestimonial, Summary, Testimonial } from "@/lib/types";
import { ONE_UP, parseConfig, type WidgetConfig, type WidgetType } from "@/lib/widget/config";
import { uniqueCompanies } from "@/lib/widget/select";
import { fileUrl } from "./files";

export function toPublic(t: Testimonial): PublicTestimonial {
  return {
    id: t.id,
    name: t.name,
    title: t.title,
    company: t.company,
    handle: t.handle,
    text: t.text,
    rating: t.rating,
    source: t.source,
    sourceUrl: t.source_url,
    avatar: fileUrl(t.avatar_key),
    video: fileUrl(t.video_key),
    poster: fileUrl(t.poster_key),
    videoAspect: t.video_aspect,
    image: fileUrl(t.image_key),
    date: new Date(t.given_at).toISOString(),
    featured: t.featured,
    tags: t.tags,
    companyLogo: fileUrl(t.company_logo_key),
    videoStart: t.video_start ?? null,
    videoEnd: t.video_end ?? null,
    highlight: t.highlight ?? null,
    captions: t.captions && !t.spam ? `${env.appUrl}/api/captions/${t.id}` : null,
    rewarded: t.rewarded ?? false,
  };
}

export type WidgetPayload = {
  widget: { id: string; name: string; type: WidgetType; config: WidgetConfig; spaceId: string };
  space: PublicSpace;
  items: PublicTestimonial[];
  summary: Summary;
};

const TYPE_FILTER: Partial<Record<WidgetType, string>> = {
  video: "video_key is not null",
  gallery: "image_key is not null",
  logos: "(company_logo_key is not null or coalesce(company, '') <> '')",
  popup: "text <> ''",
  hero: "text <> ''",
};

const ORDER = {
  newest: "given_at desc, id",
  oldest: "given_at asc, id",
  rating: "coalesce(rating, 0) desc, given_at desc, id",
} as const;

async function loadWidget(id: string, asWall = false): Promise<WidgetPayload | null> {
  const row = await one<{
    id: string;
    name: string;
    type: WidgetType;
    config: unknown;
    space_id: string;
    space_name: string;
    slug: string;
    logo_key: string | null;
    website: string | null;
  }>(
    `select w.id, w.name, w.type, w.config, w.space_id, s.name as space_name, s.slug, s.logo_key, s.website
     from widgets w join spaces s on s.id = w.space_id where w.id = $1`,
    [id],
  );
  if (!row) return null;
  const config = parseConfig(row.config);
  const where = ["space_id = $1", "status = 'approved'"];
  const params: unknown[] = [row.space_id];
  if (config.include === "featured") where.push("featured");
  if (config.tag) {
    params.push(config.tag);
    where.push(`$${params.length} = any(tags)`);
  }
  if (config.minRating > 0) {
    params.push(config.minRating);
    where.push(`coalesce(rating, 0) >= $${params.length}`);
  }
  const filter = where.join(" and ");
  let items: Testimonial[] = [];
  const type: WidgetType = asWall ? "wall" : row.type;
  // Some layouts need something from each testimonial (a video, an image, a company).
  const fits = TYPE_FILTER[type] ? `${filter} and ${TYPE_FILTER[type]}` : filter;
  if (ONE_UP.includes(type) && config.pick) {
    items = await q<Testimonial>(`select * from testimonials where ${fits} and id = $${params.length + 1}`, [...params, config.pick]);
  }
  if (!items.length) {
    const limit = asWall
      ? Math.max(config.max, 60)
      : ONE_UP.includes(type)
        ? 1
        : type === "badge"
          ? 3
          : type === "avatars"
            ? config.faces
            : type === "logos"
              ? config.max * 4
              : config.max;
    const avatarFirst = type === "badge" || type === "avatars" ? "(avatar_key is null), " : "";
    const logoFirst = type === "logos" ? "(company_logo_key is null), " : "";
    items = await q<Testimonial>(
      `select * from testimonials where ${fits} order by ${avatarFirst}${logoFirst}featured desc, ${ORDER[config.sort]} limit ${limit}`,
      params,
    );
  }
  const agg = await one<{ avg: string | null; count: string; rated: string }>(
    `select avg(rating)::numeric(3,2)::text as avg, count(*)::text as count, count(rating)::text as rated from testimonials where ${filter}`,
    params,
  );
  const average = agg?.avg ? Math.round(Number(agg.avg) * 10) / 10 : null;
  let shown = items.map(toPublic);
  // A widget set to another language shows the translations it has (the rest in their own words).
  if (config.language) {
    const tr = await translationsFor(
      shown.map((t) => t.id),
      config.language,
    );
    shown = shown.map((t) => {
      const x = tr.get(t.id);
      return x ? { ...t, text: x.text, highlight: x.highlight } : t;
    });
  }
  if (type === "logos") shown = uniqueCompanies(shown).slice(0, config.max);
  return {
    widget: { id: row.id, name: row.name, type: row.type, config, spaceId: row.space_id },
    space: { name: row.space_name, slug: row.slug, logo: fileUrl(row.logo_key), website: row.website },
    items: shown,
    summary: { average, count: Number(agg?.count ?? 0), rated: Number(agg?.rated ?? 0) },
  };
}

// Misses are not cached (a thrown error never is), so requests for made-up ids can't fill the cache.
class Missing extends Error {}
async function cached(name: string, id: string, wall: boolean): Promise<WidgetPayload | null> {
  const load = unstable_cache(
    async () => {
      const payload = await loadWidget(id, wall);
      if (!payload) throw new Missing();
      return payload;
    },
    [name, id, env.appUrl],
    { tags: [`widget:${id}`], revalidate: 86400 },
  );
  try {
    return await load();
  } catch (error) {
    if (error instanceof Missing) return null;
    throw error;
  }
}

// Cached per widget; every change to the widget, its space or its testimonials calls updateTag(`widget:<id>`).
export function getWidgetPayload(id: string): Promise<WidgetPayload | null> {
  return cached("widget-payload", id, false);
}

// The public wall page shows any widget's testimonials as a full wall (at least 60).
export function getWallPayload(id: string): Promise<WidgetPayload | null> {
  return cached("wall-payload", id, true);
}
