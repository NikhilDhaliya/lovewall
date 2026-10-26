import type { PublicTestimonial, Summary } from "@/lib/types";
import { ONE_UP, type WidgetConfig } from "./config";

// What a layout needs from a testimonial: Video plays one, Gallery shows images, Logos needs a company.
export function fitsLayout(t: PublicTestimonial, type?: string): boolean {
  if (type === "video") return Boolean(t.video);
  if (type === "gallery") return Boolean(t.image);
  if (type === "logos") return Boolean(t.companyLogo || t.company);
  if (type === "popup" || type === "hero") return Boolean(t.text);
  return true;
}

// Which testimonials a widget shows, in which order. Featured ones are pinned first; `sort` orders the rest.
// The server applies the same rules in SQL; the configurator uses this for its instant preview.
export function selectItems(all: PublicTestimonial[], config: WidgetConfig, type?: string): PublicTestimonial[] {
  let items = all.filter((t) => (config.include === "featured" ? t.featured : true));
  if (config.tag) items = items.filter((t) => t.tags.includes(config.tag!));
  if (config.minRating > 0) items = items.filter((t) => (t.rating ?? 0) >= config.minRating);
  items = items.filter((t) => fitsLayout(t, type));
  const by = {
    newest: (a: PublicTestimonial, b: PublicTestimonial) => b.date.localeCompare(a.date),
    oldest: (a: PublicTestimonial, b: PublicTestimonial) => a.date.localeCompare(b.date),
    rating: (a: PublicTestimonial, b: PublicTestimonial) => (b.rating ?? 0) - (a.rating ?? 0) || b.date.localeCompare(a.date),
  }[config.sort];
  items = [...items].sort((a, b) => Number(b.featured) - Number(a.featured) || by(a, b));
  const one = ONE_UP.includes(type as never);
  if (one && config.pick) {
    const picked = all.find((t) => t.id === config.pick && fitsLayout(t, type));
    if (picked) return [picked];
  }
  // Avatars and the badge show faces: people with a photo first.
  if (type === "avatars" || type === "badge") items.sort((a, b) => Number(Boolean(b.avatar)) - Number(Boolean(a.avatar)));
  if (type === "avatars") return items.slice(0, config.faces);
  if (type === "logos") items = uniqueCompanies(items);
  return items.slice(0, one ? 1 : config.max);
}

// One logo per company (case-insensitive), the first one with an uploaded logo winning.
export function uniqueCompanies(items: PublicTestimonial[]): PublicTestimonial[] {
  const seen = new Map<string, PublicTestimonial>();
  for (const t of items) {
    const key = (t.company ?? "").trim().toLowerCase() || `#${t.id}`;
    const prev = seen.get(key);
    if (!prev || (!prev.companyLogo && t.companyLogo)) seen.set(key, t);
  }
  return [...seen.values()];
}

export function summarize(items: PublicTestimonial[], config: WidgetConfig): Summary {
  const all = selectItems(items, { ...config, max: 100_000 });
  const pool = all.filter((t) => t.rating);
  if (!pool.length) return { average: null, count: all.length, rated: 0 };
  const avg = pool.reduce((s, t) => s + (t.rating ?? 0), 0) / pool.length;
  return { average: Math.round(avg * 10) / 10, count: all.length, rated: pool.length };
}
