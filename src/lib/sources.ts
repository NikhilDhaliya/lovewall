import type { CsvPreset } from "./csv";
import { SOURCE_ICONS } from "./source-icons";

// Every place a testimonial can come from: the inbox filter, the edit sheet's source list, the import sheet and the
// widget's source label all read this list. Testimonials store the label ("Product Hunt"); sourceOf() maps any
// stored value (labels, ids, aliases like "twitter") back to an entry. Pure module: safe on the client and server.
//
// Lovewall reads another site only through an official feed, API or oEmbed endpoint whose terms allow showing that
// content on the customer's own site ("fetch"). Every other site is "hand": the owner brings reviews in with the
// site's own export file, by paste, as a screenshot or with the browser extension.

export type SourceId =
  | "form"
  | "manual"
  | "csv"
  | "google"
  | "trustpilot"
  | "g2"
  | "capterra"
  | "producthunt"
  | "appstore"
  | "googleplay"
  | "shopify"
  | "wordpress"
  | "chromewebstore"
  | "yelp"
  | "x"
  | "linkedin"
  | "reddit"
  | "hackernews"
  | "youtube"
  | "tiktok"
  | "facebook"
  | "instagram"
  | "email"
  | "slack"
  | "whatsapp"
  | "senja"
  | "testimonialto";

export type Source = {
  id: SourceId;
  label: string;
  icon: string | null;
  group: "reviews" | "social" | "other";
  how?: "fetch" | "hand";
  // The site's own export file, which the CSV import reads (src/lib/csv.ts).
  file?: CsvPreset;
  // Kept in sync by the daily job.
  sync?: boolean;
  // An oEmbed post: looked up again every week, and removed once it is deleted (src/lib/import/recheck.ts).
  recheck?: boolean;
  example?: string;
  aliases?: string[];
  match?: (url: URL) => boolean;
};

const host = (re: RegExp) => (url: URL) => re.test(url.hostname.toLowerCase());

export const SOURCES: Source[] = [
  { id: "form", label: "Form", icon: null, group: "other" },
  { id: "manual", label: "Manual", icon: null, group: "other" },
  { id: "csv", label: "CSV", icon: null, group: "other" },
  {
    id: "google",
    label: "Google",
    icon: SOURCE_ICONS.google,
    group: "reviews",
    how: "hand",
    file: "google",
    aliases: ["google reviews", "google maps", "google business"],
    match: (u) =>
      (/(^|\.)google\.[a-z.]+$/i.test(u.hostname) && u.pathname.startsWith("/maps")) ||
      /^maps\.google\.[a-z.]+$/i.test(u.hostname) ||
      /^maps\.app\.goo\.gl$/i.test(u.hostname) ||
      (/^goo\.gl$/i.test(u.hostname) && u.pathname.startsWith("/maps")) ||
      /^g\.page$/i.test(u.hostname),
  },
  {
    id: "trustpilot",
    label: "Trustpilot",
    icon: SOURCE_ICONS.trustpilot,
    group: "reviews",
    how: "hand",
    match: host(/(^|\.)trustpilot\.com$/),
  },
  {
    id: "g2",
    label: "G2",
    icon: SOURCE_ICONS.g2,
    group: "reviews",
    how: "hand",
    aliases: ["g2 crowd", "g2crowd"],
    match: host(/(^|\.)g2\.com$/),
  },
  {
    id: "capterra",
    label: "Capterra",
    icon: SOURCE_ICONS.capterra,
    group: "reviews",
    how: "hand",
    match: host(/(^|\.)capterra\.[a-z.]+$/),
  },
  {
    id: "producthunt",
    label: "Product Hunt",
    icon: SOURCE_ICONS.producthunt,
    group: "reviews",
    how: "hand",
    match: host(/(^|\.)producthunt\.com$/),
  },
  {
    id: "appstore",
    label: "App Store",
    icon: SOURCE_ICONS.appstore,
    group: "reviews",
    how: "fetch",
    sync: true,
    example: "apps.apple.com/us/app/acme/id123456789",
    aliases: ["apple app store", "ios", "itunes", "apple"],
    match: host(/^(apps|itunes)\.apple\.com$/),
  },
  {
    id: "googleplay",
    label: "Google Play",
    icon: SOURCE_ICONS.googleplay,
    group: "reviews",
    how: "hand",
    file: "googleplay",
    aliases: ["play store", "google play store", "android"],
    match: host(/^play\.google\.com$/),
  },
  {
    id: "shopify",
    label: "Shopify",
    icon: SOURCE_ICONS.shopify,
    group: "reviews",
    how: "hand",
    aliases: ["shopify app store"],
    match: host(/^apps\.shopify\.com$/),
  },
  {
    id: "wordpress",
    label: "WordPress",
    icon: SOURCE_ICONS.wordpress,
    group: "reviews",
    how: "fetch",
    sync: true,
    example: "wordpress.org/plugins/acme",
    aliases: ["wordpress.org", "wordpress plugin"],
    match: (u) => /(^|\.)wordpress\.org$/i.test(u.hostname) && /^\/(plugins|support\/plugin)\//.test(u.pathname),
  },
  {
    id: "chromewebstore",
    label: "Chrome Web Store",
    icon: SOURCE_ICONS.chromewebstore,
    group: "reviews",
    how: "hand",
    aliases: ["chrome", "chrome extension"],
    match: (u) =>
      /^chromewebstore\.google\.com$/i.test(u.hostname) ||
      (/^chrome\.google\.com$/i.test(u.hostname) && u.pathname.startsWith("/webstore")),
  },
  {
    id: "yelp",
    label: "Yelp",
    icon: SOURCE_ICONS.yelp,
    group: "reviews",
    how: "hand",
    match: host(/(^|\.)yelp\.[a-z.]+$/),
  },
  {
    id: "x",
    label: "X",
    icon: SOURCE_ICONS.x,
    group: "social",
    how: "fetch",
    recheck: true,
    example: "x.com/name/status/…",
    aliases: ["twitter"],
    match: host(/^(www\.|mobile\.)?(x|twitter)\.com$/),
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: SOURCE_ICONS.linkedin,
    group: "social",
    how: "hand",
    match: host(/(^|\.)linkedin\.com$|^lnkd\.in$/),
  },
  {
    id: "reddit",
    label: "Reddit",
    icon: SOURCE_ICONS.reddit,
    group: "social",
    how: "hand",
    match: host(/(^|\.)reddit\.com$|^redd\.it$/),
  },
  {
    id: "hackernews",
    label: "Hacker News",
    icon: SOURCE_ICONS.ycombinator,
    group: "social",
    how: "fetch",
    example: "news.ycombinator.com/item?id=…",
    aliases: ["hn", "ycombinator", "y combinator"],
    match: host(/^news\.ycombinator\.com$/),
  },
  {
    id: "youtube",
    label: "YouTube",
    icon: SOURCE_ICONS.youtube,
    group: "social",
    how: "fetch",
    recheck: true,
    example: "youtube.com/watch?v=…",
    match: host(/(^|\.)youtube\.com$|^youtu\.be$/),
  },
  {
    id: "tiktok",
    label: "TikTok",
    icon: SOURCE_ICONS.tiktok,
    group: "social",
    how: "fetch",
    recheck: true,
    example: "tiktok.com/@name/video/…",
    match: host(/(^|\.)tiktok\.com$/),
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: SOURCE_ICONS.facebook,
    group: "social",
    how: "hand",
    match: host(/(^|\.)(facebook|fb)\.com$|^fb\.watch$/),
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: SOURCE_ICONS.instagram,
    group: "social",
    how: "hand",
    match: host(/(^|\.)instagram\.com$/),
  },
  { id: "email", label: "Email", icon: SOURCE_ICONS.email, group: "other", aliases: ["e-mail", "gmail", "mail"] },
  { id: "slack", label: "Slack", icon: SOURCE_ICONS.slack, group: "other" },
  { id: "whatsapp", label: "WhatsApp", icon: SOURCE_ICONS.whatsapp, group: "other" },
  { id: "senja", label: "Senja", icon: null, group: "other" },
  { id: "testimonialto", label: "Testimonial.to", icon: null, group: "other", aliases: ["testimonial"] },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const INDEX = new Map<string, Source>();
for (const s of SOURCES) {
  for (const k of [s.id, s.label, ...(s.aliases ?? [])]) if (!INDEX.has(norm(k))) INDEX.set(norm(k), s);
}

// The entry for a stored source value ("Product Hunt", "producthunt", "Twitter"...), or null for free text.
export function sourceOf(value: string | null | undefined): Source | null {
  return value ? (INDEX.get(norm(value)) ?? null) : null;
}

export function sourceById(id: string): Source | null {
  return SOURCES.find((s) => s.id === id) ?? null;
}

// The label a testimonial stores: the canonical label for known sources, else the text as given.
export function sourceLabel(value: string): string {
  return sourceOf(value)?.label ?? value;
}

// Sources the owner can pick in the edit sheet and the screenshot import (not Form, CSV or Manual).
export const PICKABLE = SOURCES.filter((s) => !["form", "manual", "csv"].includes(s.id));

// Turns "acme.com/x" or " https://… " into a URL, or null for plain text.
export function toUrl(input: string): URL | null {
  const s = input.trim();
  if (!s || /\s/.test(s)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return url.hostname.includes(".") ? url : null;
  } catch {
    return null;
  }
}

// Which source a pasted link belongs to (null when nothing matches).
export function detectSource(input: string): Source | null {
  const url = toUrl(input);
  if (!url) return null;
  return SOURCES.find((s) => s.match?.(url)) ?? null;
}
