import { z } from "zod";

// Shared by the server (validation, rendering) and the configurator (defaults, controls).
export const WIDGET_TYPES = [
  "wall",
  "grid",
  "list",
  "carousel",
  "marquee",
  "gallery",
  "single",
  "hero",
  "video",
  "popup",
  "badge",
  "avatars",
  "logos",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const WIDGET_LABELS: Record<WidgetType, string> = {
  wall: "Wall",
  grid: "Grid",
  list: "List",
  carousel: "Carousel",
  marquee: "Marquee",
  gallery: "Gallery",
  single: "Single",
  hero: "Hero quote",
  video: "Video",
  popup: "Popup",
  badge: "Rating badge",
  avatars: "Avatars",
  logos: "Logos",
};

// Layouts that show one testimonial, and the ones that size to their content (inline on the host page).
export const ONE_UP: readonly WidgetType[] = ["single", "hero", "video"];
export const INLINE: readonly WidgetType[] = ["badge", "avatars"];

export const POPUP_POSITIONS = ["bottom-left", "bottom-right", "top-left", "top-right"] as const;
export const PAGE_STYLES = ["centered", "left", "tinted", "split"] as const;
export type PageStyle = (typeof PAGE_STYLES)[number];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

// One line of plain text (control characters become spaces), or the fallback when it is too long or not a string.
const text = (max: number, fallback: string) =>
  z
    .string()
    .max(max)
    .transform((s) => s.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").trim())
    .catch(fallback);

// http(s) links only; anything else is dropped.
const link = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .transform((s) => {
    if (!s) return null;
    const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    try {
      const url = new URL(withScheme);
      return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".") ? url.href : null;
    } catch {
      return null;
    }
  })
  .catch(null);

export const CSS_MAX = 8000;

export const widgetConfigSchema = z.object({
  theme: z.enum(["light", "dark", "auto"]).catch("light"),
  accent: hex.catch("#1d1d1f"),
  radius: z.number().int().min(0).max(28).catch(12),
  include: z.enum(["approved", "featured"]).catch("approved"),
  tag: z.string().trim().max(32).nullable().catch(null),
  minRating: z.number().int().min(0).max(5).catch(0),
  showRating: z.boolean().catch(true),
  showDate: z.boolean().catch(false),
  showSource: z.boolean().catch(true),
  showPhoto: z.boolean().catch(true),
  max: z.number().int().min(1).max(100).catch(30),
  sort: z.enum(["newest", "oldest", "rating"]).catch("newest"),
  branding: z.boolean().catch(true),
  speed: z.enum(["slow", "normal", "fast"]).catch("normal"),
  rows: z.number().int().min(1).max(3).catch(2),
  autoplay: z.boolean().catch(true),
  pick: z.string().max(32).nullable().catch(null),
  // Layout variants: wall and grid columns (0 = fit the width), cards per view in the carousel (0 = auto),
  // marquee direction.
  columns: z.number().int().min(0).max(4).catch(0),
  perView: z.number().int().min(0).max(3).catch(0),
  direction: z.enum(["left", "right"]).catch("left"),
  // Popup: corner, first delay and time per card (seconds), a close button, and whether it shows on phones.
  popupPosition: z.enum(POPUP_POSITIONS).catch("bottom-left"),
  popupDelay: z.number().int().min(0).max(60).catch(3),
  popupInterval: z.number().int().min(4).max(60).catch(8),
  popupDismiss: z.boolean().catch(true),
  popupPhones: z.boolean().catch(false),
  // Avatars: how many faces, the line under them ({count} is replaced) and an optional count of your own.
  faces: z.number().int().min(3).max(8).catch(5),
  avatarsText: text(80, "Loved by {count} customers"),
  avatarsCount: z.number().int().min(1).max(10_000_000).nullable().catch(null),
  // Logos: a caption above the row, and logos in one colour.
  logosCaption: text(80, "Trusted by teams at"),
  logosMono: z.boolean().catch(true),
  // Owner CSS, added after ours (sanitised when rendered: see customCss in render.ts).
  css: z.string().max(CSS_MAX).catch(""),
  // Review stars in Google: Review + AggregateRating JSON-LD on the host page and the wall page.
  snippets: z.boolean().catch(false),
  // The public wall page (/w/<id>).
  pageStyle: z.enum(PAGE_STYLES).catch("centered"),
  pageTitle: text(80, ""),
  pageText: text(280, ""),
  pageFilters: z.boolean().catch(true),
  pageAddYours: z.boolean().catch(true),
  ctaLabel: text(40, ""),
  ctaUrl: link,
  // AI: mark each testimonial's best line, and show translations in this language (null: as written).
  highlight: z.boolean().catch(false),
  language: z
    .string()
    .regex(/^[a-z]{2}$/)
    .nullable()
    .catch(null),
});

export type WidgetConfig = z.infer<typeof widgetConfigSchema>;

const MAX: Partial<Record<WidgetType, number>> = { single: 1, hero: 1, video: 1, carousel: 12, popup: 10, logos: 12 };

export function defaultConfig(type: WidgetType, accent = "#1d1d1f"): WidgetConfig {
  return widgetConfigSchema.parse({
    accent: /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#1d1d1f",
    max: MAX[type] ?? 30,
    rows: 2,
  });
}

// Tolerant parse: unknown or broken fields fall back to defaults instead of failing the widget.
export function parseConfig(raw: unknown): WidgetConfig {
  return widgetConfigSchema.parse(raw && typeof raw === "object" ? raw : {});
}
