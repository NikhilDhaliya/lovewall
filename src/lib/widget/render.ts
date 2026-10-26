import { cssColor, esc, luminance } from "@/lib/escape";
import { sourceOf } from "@/lib/sources";
import type { PublicSpace, PublicTestimonial, Summary } from "@/lib/types";
import { CSS_MAX, type WidgetConfig, type WidgetType } from "./config";

// One renderer for every widget, as plain HTML strings: the embed route serves it with no framework runtime, the
// configurator previews it live in a srcdoc iframe, and the public wall page reuses it. Every dynamic value is
// escaped with esc(); colours and numbers are validated before they reach CSS.

export type RenderInput = {
  widgetId: string;
  type: WidgetType;
  config: WidgetConfig;
  items: PublicTestimonial[];
  summary: Summary;
  space: PublicSpace;
  appUrl: string;
  mode: "embed" | "preview" | "page";
};

const STAR = '<path d="M12 2.6l2.83 6.08 6.67.78-4.93 4.55 1.31 6.58L12 17.3l-5.88 3.29 1.31-6.58L2.5 9.46l6.67-.78z"/>';

export function stars(rating: number | null, size = 14) {
  if (!rating) return "";
  let out = "";
  for (let i = 1; i <= 5; i++) {
    out += `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" class="${i <= rating ? "" : "off"}" aria-hidden="true">${STAR}</svg>`;
  }
  return `<div class="lw-stars" role="img" aria-label="${rating} out of 5 stars">${out}</div>`;
}

export function sourceKey(source: string) {
  const s = source.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (s === "x" || s === "twitter") return "x";
  return s;
}

function sourceBadge(t: PublicTestimonial) {
  const known = sourceOf(t.source);
  const key = known?.id ?? sourceKey(t.source);
  if (key === "form" || key === "manual" || key === "csv" || !key) return "";
  const label = known?.label ?? t.source;
  const inner = known?.icon
    ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="${known.icon}"/></svg><span class="lw-sr">${esc(label)}</span>`
    : `<span>${esc(label)}</span>`;
  const safeUrl = t.sourceUrl && /^https:\/\//i.test(t.sourceUrl) ? t.sourceUrl : null;
  return safeUrl
    ? `<a class="lw-src" href="${esc(safeUrl)}" target="_blank" rel="noopener nofollow ugc" aria-label="View on ${esc(label)}">${inner}</a>`
    : `<span class="lw-src">${inner}</span>`;
}

const DATE = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const NUMBER = new Intl.NumberFormat("en");

export function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : DATE.format(d);
}

const SILHOUETTE =
  '<svg class="lw-av lw-av-empty" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="20" fill="var(--lw-av)"/><circle cx="20" cy="16" r="6.5" fill="var(--lw-av-ink)"/><path d="M7.5 33.5c2.4-5.6 7-8.5 12.5-8.5s10.1 2.9 12.5 8.5A19.9 19.9 0 0 1 20 40a19.9 19.9 0 0 1-12.5-6.5z" fill="var(--lw-av-ink)"/></svg>';

function avatar(t: PublicTestimonial, show: boolean) {
  if (!show) return "";
  if (t.avatar) return `<img class="lw-av" src="${esc(t.avatar)}" alt="" width="36" height="36" loading="lazy" decoding="async">`;
  return SILHOUETTE;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts.slice(0, 1);
  return letters.map((p) => Array.from(p)[0]?.toUpperCase() ?? "").join("");
}

function subtitle(t: PublicTestimonial) {
  const role = [t.title, t.company].filter(Boolean).join(", ");
  return role || (t.handle ? `@${t.handle.replace(/^@/, "")}` : "");
}

function who(t: PublicTestimonial, c: WidgetConfig, extra = "") {
  const sub = subtitle(t);
  return `<figcaption class="lw-who">${avatar(t, c.showPhoto)}<div class="lw-id"><div class="lw-name">${esc(t.name)}</div>${
    sub ? `<div class="lw-sub">${esc(sub)}</div>` : ""
  }</div>${extra}</figcaption>`;
}

// The trimmed range of a video, in seconds (0 = from the start / to the end).
export function trimOf(t: { videoStart?: number | null; videoEnd?: number | null }) {
  const start = t.videoStart && t.videoStart > 0 ? t.videoStart : 0;
  const end = t.videoEnd && t.videoEnd > start ? t.videoEnd : 0;
  return { start, end };
}

// A media fragment ("#t=4.5,21") so browsers start at the trimmed start; the runtime script enforces the end.
export function trimFragment(t: { videoStart?: number | null; videoEnd?: number | null }) {
  const { start, end } = trimOf(t);
  return start || end ? `#t=${start.toFixed(2)}${end ? `,${end.toFixed(2)}` : ""}` : "";
}

function video(t: PublicTestimonial) {
  if (!t.video) return "";
  const ar = t.videoAspect && t.videoAspect > 0 ? Math.min(16 / 9, Math.max(9 / 16, t.videoAspect)) : 16 / 9;
  const { start, end } = trimOf(t);
  // A clean poster with one play button; the native controls appear once it plays.
  return `<div class="lw-video" style="aspect-ratio:${ar.toFixed(4)}"><video playsinline preload="none"${
    t.poster ? ` poster="${esc(t.poster)}"` : ""
  } src="${esc(t.video + trimFragment(t))}"${start ? ` data-start="${start.toFixed(2)}"` : ""}${
    end ? ` data-end="${end.toFixed(2)}"` : ""
  }>${
    t.captions ? `<track kind="captions" src="${esc(t.captions)}" label="Captions" default>` : ""
  }</video><button class="lw-play" type="button" aria-label="Play video from ${esc(t.name)}">${PLAY_ICON}</button></div>`;
}

// An image testimonial (a screenshot or review card): opens large in a lightbox.
function image(t: PublicTestimonial) {
  if (!t.image) return "";
  return `<button type="button" class="lw-zoom lw-img" data-src="${esc(t.image)}" data-caption="${esc(
    [t.name, subtitle(t)].filter(Boolean).join(" · "),
  )}" aria-label="Open image from ${esc(t.name)}"><img src="${esc(t.image)}" alt="Testimonial from ${esc(t.name)}" loading="lazy" decoding="async"></button>`;
}

const PLAY_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M8 5.6v12.8c0 .8.9 1.3 1.6.9l10-6.4c.6-.4.6-1.3 0-1.7l-10-6.4C8.9 4.3 8 4.8 8 5.6z"/></svg>';

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

// Long quotes are clamped where cards should line up (grid, carousel), with a "Read more" button.
const LONG = 240;

// The text, with its best line marked when the widget shows best lines (the line is always the testimonial's own words).
export function textHtml(t: Pick<PublicTestimonial, "text" | "highlight">) {
  const at = t.highlight ? t.text.indexOf(t.highlight) : -1;
  if (at < 0 || !t.highlight) return esc(t.text);
  const end = at + t.highlight.length;
  return `${esc(t.text.slice(0, at))}<mark class="lw-hl">${esc(t.highlight)}</mark>${esc(t.text.slice(end))}`;
}

function quote(t: PublicTestimonial, clamp = false) {
  if (!t.text) return "";
  const long = clamp && t.text.length > LONG;
  return `<blockquote class="lw-text${long ? " lw-clamp" : ""}">${textHtml(t)}</blockquote>${
    long ? '<button class="lw-more" type="button" aria-expanded="false">Read more</button>' : ""
  }`;
}

// The giver got a reward for this testimonial: said on every layout that shows the words, and not a setting.
export const REWARDED_TEXT = "Got a reward for this review";
function rewarded(t: Pick<PublicTestimonial, "rewarded">) {
  return t.rewarded ? `<div class="lw-rew">${REWARDED_TEXT}</div>` : "";
}

type CardOpts = { clamp?: boolean; tags?: boolean };

function card(t: PublicTestimonial, c: WidgetConfig, opts: CardOpts = {}) {
  const date = c.showDate ? `<time datetime="${esc(t.date)}">${esc(formatDate(t.date))}</time>` : "";
  const src = c.showSource ? sourceBadge(t) : "";
  const rating = c.showRating ? stars(t.rating) : "";
  const head =
    rating || date || src ? `<div class="lw-head">${rating || "<span></span>"}<div class="lw-meta">${date}${src}</div></div>` : "";
  // The wall page filters cards by tag ("|a|b|", so a tag never matches part of another).
  const tags = opts.tags ? ` data-tags="${esc(`|${t.tags.join("|")}|`)}"` : "";
  return `<figure class="lw-card"${tags}>${head}${video(t)}${image(t)}${quote(t, opts.clamp)}${rewarded(t)}${who(t, c)}</figure>`;
}

// Under the widget: "Made with Lovewall" (a switch) and "Report" (always; the wall page has its own footer).
function branding(input: RenderInput) {
  const report =
    input.mode === "page"
      ? ""
      : `<a class="lw-report" href="${esc(input.appUrl)}/r/${esc(input.widgetId)}" target="_blank" rel="noopener nofollow">Report</a>`;
  const made = input.config.branding
    ? `<a href="${esc(input.appUrl)}/?ref=widget" target="_blank" rel="noopener">${HEART}Made with Lovewall</a>`
    : "";
  return made || report ? `<div class="lw-brand">${made}${report}</div>` : "";
}

const HEART =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M12 20.7s-7.5-4.6-9.6-9.3C.9 8 2.9 4 6.6 4c2.2 0 3.7 1.2 5.4 3.1C13.7 5.2 15.2 4 17.4 4c3.7 0 5.7 4 4.2 7.4-2.1 4.7-9.6 9.3-9.6 9.3z"/></svg>';

const CHEVRON = (dir: "l" | "r") =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${
    dir === "l" ? "M14.5 6l-6 6 6 6" : "M9.5 6l6 6-6 6"
  }"/></svg>`;

const cols = (n: number) => (n > 0 ? ` data-cols style="--cols:${Math.min(4, Math.round(n))}"` : "");

function wall(input: RenderInput) {
  const tags = input.mode === "page" && input.config.pageFilters;
  return `<div class="lw-wall"${cols(input.config.columns)}>${input.items.map((t) => card(t, input.config, { tags })).join("")}</div>`;
}

function grid(input: RenderInput) {
  return `<div class="lw-grid" style="--cols:${input.config.columns || 3}">${input.items
    .map((t) => card(t, input.config, { clamp: true }))
    .join("")}</div>`;
}

function list(input: RenderInput) {
  const c = input.config;
  const rows = input.items.map((t) => {
    const sub = subtitle(t);
    const date = c.showDate ? `<time datetime="${esc(t.date)}">${esc(formatDate(t.date))}</time>` : "";
    const src = c.showSource ? sourceBadge(t) : "";
    return `<figure class="lw-li">${avatar(t, c.showPhoto)}<div class="lw-li-main"><div class="lw-li-head"><figcaption class="lw-id"><div class="lw-name">${esc(
      t.name,
    )}</div>${sub ? `<div class="lw-sub">${esc(sub)}</div>` : ""}</figcaption>${
      date || src ? `<div class="lw-meta">${date}${src}</div>` : ""
    }</div>${c.showRating ? stars(t.rating, 13) : ""}${video(t)}${image(t)}${quote(t)}${rewarded(t)}</div></figure>`;
  });
  return `<div class="lw-list">${rows.join("")}</div>`;
}

function carousel(input: RenderInput) {
  const pv = input.config.perView;
  return `<div class="lw-car" data-autoplay="${input.config.autoplay ? "1" : "0"}"${pv ? ` data-pv="${pv}"` : ""}><div class="lw-track" tabindex="0" role="region" aria-label="Testimonials">${input.items
    .map((t) => card(t, input.config, { clamp: true }))
    .join("")}</div>${
    input.items.length > 1
      ? `<div class="lw-nav"><button class="lw-btn" type="button" data-dir="-1" aria-label="Previous">${CHEVRON("l")}</button><button class="lw-btn" type="button" data-dir="1" aria-label="Next">${CHEVRON("r")}</button></div>`
      : ""
  }</div>`;
}

function marquee(input: RenderInput) {
  const rows = Math.max(1, Math.min(input.config.rows, input.items.length));
  const perCard = { slow: 9, normal: 6, fast: 3.5 }[input.config.speed];
  const flip = input.config.direction === "right" ? 1 : 0;
  let out = "";
  for (let r = 0; r < rows; r++) {
    let list = input.items.filter((_, i) => i % rows === r);
    // Repeat short rows so one copy is wider than any screen, then double it for a seamless loop.
    const base = list;
    while (list.length < 8) list = list.concat(base);
    const cards = list.map((t) => card(t, input.config)).join("");
    out += `<div class="lw-row${(r + flip) % 2 ? " rev" : ""}" style="--dur:${(list.length * perCard).toFixed(1)}s"><div class="lw-set">${cards}</div><div class="lw-set" aria-hidden="true">${cards}</div></div>`;
  }
  return `<div class="lw-mq">${out}</div>`;
}

function gallery(input: RenderInput) {
  const c = input.config;
  const tiles = input.items.map((t) => {
    const sub = subtitle(t);
    return `<figure class="lw-tile">${image(t)}<figcaption class="lw-tile-cap">${c.showRating ? stars(t.rating, 12) : ""}<span class="lw-name">${esc(
      t.name,
    )}</span>${sub ? `<span class="lw-sub">${esc(sub)}</span>` : ""}</figcaption>${rewarded(t)}</figure>`;
  });
  return `<div class="lw-gal"${cols(c.columns)}>${tiles.join("")}</div>`;
}

function single(input: RenderInput) {
  const t = input.items[0];
  const c = input.config;
  return `<figure class="lw-single">${c.showRating ? stars(t.rating, 18) : ""}${video(t)}${image(t)}${quote(t)}${rewarded(t)}${who(
    t,
    c,
    c.showSource ? sourceBadge(t) : "",
  )}</figure>`;
}

function logoImg(t: PublicTestimonial, cls: string) {
  return t.companyLogo ? `<img class="${cls}" src="${esc(t.companyLogo)}" alt="${esc(t.company || t.name)}" loading="lazy">` : "";
}

// One quote, large: for a landing page hero or a pricing page (text only; the Video layout plays videos).
function heroQuote(input: RenderInput) {
  const t = input.items[0];
  const c = input.config;
  return `<figure class="lw-hq">${c.showRating ? stars(t.rating, 20) : ""}<blockquote class="lw-text">${textHtml(t)}</blockquote>${rewarded(t)}${who(
    t,
    c,
    logoImg(t, "lw-hq-logo"),
  )}</figure>`;
}

// One video testimonial with a large player.
function videoOne(input: RenderInput) {
  const t = input.items[0];
  const c = input.config;
  return `<figure class="lw-vid">${video(t)}${who(t, c, c.showRating ? stars(t.rating, 14) : "")}${
    t.text ? `<blockquote class="lw-text">${textHtml(t)}</blockquote>` : ""
  }${rewarded(t)}</figure>`;
}

// Small cards that slide in at a corner of the page, one after another (see the runtime script).
function popup(input: RenderInput) {
  const c = input.config;
  const page = `${esc(input.appUrl)}/w/${esc(input.widgetId)}`;
  const cards = input.items.map(
    (t) =>
      `<figure class="lw-pc" hidden><div class="lw-pc-head">${avatar(t, c.showPhoto)}<div class="lw-id"><a class="lw-name lw-cover" href="${page}" target="_blank" rel="noopener">${esc(
        t.name,
      )}</a>${c.showRating && t.rating ? stars(t.rating, 12) : `<div class="lw-sub">${esc(subtitle(t))}</div>`}</div></div><blockquote class="lw-text">${textHtml(t)}</blockquote>${rewarded(t)}${c.popupDismiss ? `<button class="lw-x" type="button" aria-label="Close">${CLOSE_ICON}</button>` : ""}</figure>`,
  );
  return `<aside class="lw-pop" aria-label="Testimonials" data-pos="${esc(c.popupPosition)}" data-delay="${c.popupDelay}" data-interval="${
    c.popupInterval
  }" data-phones="${c.popupPhones ? 1 : 0}">${cards.join("")}</aside>`;
}

function badge(input: RenderInput) {
  const { average, count } = input.summary;
  const faces = input.items
    .filter((t) => t.avatar)
    .slice(0, 3)
    .map((t) => `<img src="${esc(t.avatar)}" alt="" width="26" height="26">`)
    .join("");
  const score = average ? `<span class="lw-score">${average.toFixed(1)}</span>` : "";
  const label = `${count} ${count === 1 ? "review" : "reviews"}`;
  return `<a class="lw-badge lw-inline" href="${esc(input.appUrl)}/w/${esc(input.widgetId)}" target="_blank" rel="noopener">${
    faces && input.config.showPhoto ? `<span class="lw-faces">${faces}</span>` : ""
  }<span class="lw-badge-main">${average ? stars(Math.round(average), 14) : ""}<span class="lw-badge-line">${score}${
    score ? '<span class="lw-dot">·</span>' : ""
  }<span class="lw-count">${label}</span></span></span></a>`;
}

// An overlapping stack of faces, the stars, and one line ("Loved by 1,240 customers").
function avatarStack(input: RenderInput) {
  const c = input.config;
  const { average, count } = input.summary;
  const total = NUMBER.format(c.avatarsCount ?? count);
  const text = esc(c.avatarsText);
  const line = text.includes("{count}") ? text.replace("{count}", `<strong>${total}</strong>`) : text;
  const faces = input.items
    .slice(0, c.faces)
    .map((t) =>
      t.avatar
        ? `<img src="${esc(t.avatar)}" alt="" width="34" height="34">`
        : `<span class="lw-ini" aria-hidden="true">${esc(initials(t.name))}</span>`,
    )
    .join("");
  const rating =
    c.showRating && average
      ? `<span class="lw-avs-rate">${stars(Math.round(average), 14)}<span class="lw-score">${average.toFixed(1)}</span></span>`
      : "";
  return `<a class="lw-avs lw-inline" href="${esc(input.appUrl)}/w/${esc(input.widgetId)}" target="_blank" rel="noopener">${
    faces && c.showPhoto ? `<span class="lw-stack">${faces}</span>` : ""
  }<span class="lw-avs-main">${rating}<span class="lw-avs-line">${line}</span></span></a>`;
}

// Company logos in a row; companies without an uploaded logo are set in type.
function logos(input: RenderInput) {
  const c = input.config;
  const list = input.items.map(
    (t) => `<li>${t.companyLogo ? logoImg(t, "lw-logo") : `<span class="lw-word">${esc(t.company)}</span>`}</li>`,
  );
  return `<div class="lw-logos${c.logosMono ? " lw-mono" : ""}">${
    c.logosCaption ? `<p class="lw-cap">${esc(c.logosCaption)}</p>` : ""
  }<ul class="lw-logo-row" aria-label="${esc(c.logosCaption || "Customers")}">${list.join("")}</ul></div>`;
}

const LAYOUTS: Record<WidgetType, (input: RenderInput) => string> = {
  wall,
  grid,
  list,
  carousel,
  marquee,
  gallery,
  single,
  hero: heroQuote,
  video: videoOne,
  popup,
  badge,
  avatars: avatarStack,
  logos,
};

// Compact layouts sit inside the host's own design: no "Made with Lovewall" line under them.
const NO_BRANDING: readonly WidgetType[] = ["badge", "popup", "avatars", "logos"];

const EMPTY: Partial<Record<WidgetType, string>> = {
  video: "No video testimonials yet",
  gallery: "No image testimonials yet",
  logos: "No companies yet",
};

export function widgetBody(input: RenderInput): string {
  if (!input.items.length && input.type !== "badge") {
    return input.mode === "embed" ? "" : `<div class="lw-empty">${EMPTY[input.type] ?? "No testimonials to show yet"}</div>`;
  }
  // Best lines show only when the widget asks for them.
  const body = LAYOUTS[input.type](
    input.config.highlight ? input : { ...input, items: input.items.map((t) => ({ ...t, highlight: null })) },
  );
  return `<div class="lw lw-t-${input.type}">${body}${NO_BRANDING.includes(input.type) ? "" : branding(input)}</div>`;
}

// Owner CSS goes inside a <style> element. Removing every "<" means nothing in it can close that element (the
// HTML parser only ends a style block at "</style"); @import and old script-in-CSS tricks are dropped too, and the
// pages' CSP blocks loading anything from other origins.
export function customCss(css: string | null | undefined): string {
  return (
    String(css ?? "")
      .slice(0, CSS_MAX)
      .replace(/</g, "")
      // CSS escapes would let "@\69mport" or "u\72l(" through the checks below.
      .replace(/\\/g, "")
      .replace(/@import[^;]*;?/gi, "")
      // Images by https or data: only; a relative url() would make visitors' browsers call this app with their cookies.
      .replace(/url\s*\(\s*(?!['"]?\s*(?:https:\/\/|data:image\/))/gi, "url(#")
      .replace(/expression\s*\(/gi, "")
      .replace(/(?:java|vb)script\s*:/gi, "")
      .replace(/-moz-binding|behavior\s*:/gi, "")
  );
}

// Review markup for search engines: Review + AggregateRating JSON-LD, built only from rated testimonials the widget
// shows that were collected through Lovewall's own forms and invites. Reviews imported from other sites are never
// marked up (search engines reject third-party reviews, and the sites' terms forbid republishing them as yours).
// Nothing is emitted when there is none. Serialised so it can sit inside a <script> element: no "<", ">" or "&".
export function jsonLd(input: Pick<RenderInput, "space" | "items">): string {
  const own = input.items.filter((t) => sourceKey(t.source) === "form" && t.rating && t.text);
  if (!own.length) return "";
  const average = Math.round((own.reduce((sum, t) => sum + (t.rating ?? 0), 0) / own.length) * 10) / 10;
  const reviews = own.slice(0, 10).map((t) => ({
    "@type": "Review",
    author: { "@type": "Person", name: t.name },
    datePublished: t.date.slice(0, 10),
    reviewBody: t.text.slice(0, 1000),
    reviewRating: { "@type": "Rating", ratingValue: t.rating, bestRating: 5, worstRating: 1 },
  }));
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.space.name,
    ...(input.space.website ? { url: input.space.website } : {}),
    ...(input.space.logo ? { image: input.space.logo } : {}),
    aggregateRating: { "@type": "AggregateRating", ratingValue: average, reviewCount: own.length, bestRating: 5, worstRating: 1 },
    review: reviews,
  };
  return safeJson(data);
}

export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function widgetCss(config: WidgetConfig, scope = ":root"): string {
  const accent = cssColor(config.accent, "#1d1d1f");
  const radius = Math.max(0, Math.min(28, Math.round(config.radius)));
  // Keep the accent visible: a near-black accent turns white on dark, a near-white one turns ink on light.
  const lum = luminance(accent);
  const onAccent = lum > 0.45 ? "#1c1c1b" : "#fff";
  const lightAccent = lum > 0.8 ? "#1c1c1b" : accent;
  const darkAccent = lum < 0.04 ? "#f3f3f1" : accent;
  const darkOn = luminance(darkAccent) > 0.45 ? "#1c1c1b" : "#fff";
  const dark = `--lw-accent:${darkAccent};--lw-on-accent:${darkOn};--lw-bg:#0d0d0c;--lw-card:#171716;--lw-line:rgba(255,255,255,.09);--lw-ink:#f3f3f1;--lw-muted:#a3a29d;--lw-faint:#8f8e89;--lw-av:#2a2a27;--lw-av-ink:#52514d;--lw-float:0 0 0 1px rgba(255,255,255,.06),0 8px 20px -6px rgba(0,0,0,.6);--lw-mono:grayscale(1) invert(1)`;
  const base =
    scope === ":root"
      ? BASE_CSS
      : BASE_CSS.replace(/^\*,\*::before,\*::after\{[^}]*\}\n/, "")
          .replace(/^html,body\{[^}]*\}\n/m, "")
          .replace(/^body\{/m, `${scope}{`);
  const light = `--lw-accent:${lightAccent};--lw-on-accent:${lum > 0.8 ? "#fff" : onAccent};--lw-bg:#fafaf9;--lw-card:#fff;--lw-line:rgba(28,28,27,.09);--lw-ink:#1c1c1b;--lw-muted:#64635f;--lw-faint:#6f6e6a;--lw-av:#ebebe8;--lw-av-ink:#c9c8c3;--lw-float:0 0 0 1px rgba(28,28,27,.04),0 8px 20px -6px rgba(28,28,27,.16);--lw-mono:grayscale(1)`;
  // Inside one of our pages, "auto" follows the page's own theme (data-theme on <html>), not only the OS.
  const follow =
    scope === ":root"
      ? ""
      : `\n:root[data-theme=dark] ${scope}[data-theme=auto]{${dark}}\n:root[data-theme=light] ${scope}[data-theme=auto]{${light}}`;
  // Our own pages have Geist loaded; embeds stay on system fonts (nothing extra to download).
  const font =
    scope === ":root"
      ? ""
      : `\n${scope}{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",var(--font-geist-sans),system-ui,sans-serif}`;
  const css = `${scope}{--lw-r:${radius}px;${light}}
${scope}[data-theme=dark]{${dark}}
@media (prefers-color-scheme:dark){${scope}[data-theme=auto]{${dark}}}${follow}
${scope === ":root" ? base : base.replace(/^a\{color:inherit\}$/m, `${scope} a{color:inherit}`)}${font}`;
  // Inside our own pages the widget CSS sits under Tailwind's utilities, so page classes always win.
  return scope === ":root" ? css : `@layer components{${css}}`;
}

const BASE_CSS = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent}
body{font:15px/1.55 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--lw-ink);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
body.lw-embed{overflow:hidden}
a{color:inherit}
.lw{padding:2px}
.lw [hidden]{display:none!important}
.lw-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.lw-card{position:relative;display:flex;flex-direction:column;gap:12px;background:var(--lw-card);border:1px solid var(--lw-line);border-radius:var(--lw-r);padding:20px;transition:border-color .2s}
.lw-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:16px}
.lw-stars{display:inline-flex;gap:1px;color:var(--lw-accent)}
.lw-stars svg{display:block}
.lw-stars .off{color:var(--lw-av)}
.lw-meta{display:flex;align-items:center;gap:10px;color:var(--lw-faint);font-size:12px;white-space:nowrap}
.lw-src{display:inline-flex;align-items:center;gap:4px;color:var(--lw-faint);text-decoration:none;font-size:12px}
a.lw-src:hover{color:var(--lw-ink)}
.lw-text{white-space:pre-line;overflow-wrap:anywhere;font-size:15px;line-height:1.6;letter-spacing:-.005em;quotes:none}
.lw-hl{color:inherit;font-weight:560;background:linear-gradient(transparent 58%,color-mix(in srgb,var(--lw-accent) 24%,transparent) 0);-webkit-box-decoration-break:clone;box-decoration-break:clone}
.lw-clamp{display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}
.lw-clamp.lw-open{display:block;-webkit-line-clamp:unset;overflow:visible}
.lw-more{align-self:flex-start;margin-top:-6px;padding:2px 0;border:0;background:none;font:inherit;font-size:13px;font-weight:550;color:var(--lw-muted);cursor:pointer;text-decoration:underline;text-decoration-color:var(--lw-line);text-underline-offset:3px}
.lw-more:hover{color:var(--lw-ink)}
.lw-rew{font-size:12px;line-height:1.4;color:var(--lw-faint)}
.lw-rew::before{content:"";display:inline-block;width:5px;height:5px;margin:0 7px 2px 0;border-radius:50%;background:currentColor}
.lw-video{position:relative;overflow:hidden;border-radius:max(0px,calc(var(--lw-r) - 8px));background:var(--lw-av);max-height:520px;margin:0 auto;width:100%}
.lw-video video{display:block;width:100%;height:100%;object-fit:cover}
.lw-play{position:absolute;inset:0;margin:auto;display:grid;place-items:center;width:52px;height:52px;border:0;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;cursor:pointer;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);transition:transform .2s cubic-bezier(.32,.72,0,1)}
.lw-play svg{margin-left:3px}
.lw-play:hover{transform:scale(1.06)}
.lw-play:active{transform:scale(.94)}
.lw-video.playing{background:#000}
.lw-video.playing .lw-play{display:none}
.lw-img{display:block;width:100%;padding:0;border:0;background:var(--lw-av);border-radius:max(0px,calc(var(--lw-r) - 8px));overflow:hidden;cursor:zoom-in}
.lw-img img{display:block;width:100%;height:auto;max-height:560px;object-fit:cover}
.lw-who{display:flex;align-items:center;gap:10px;min-width:0;margin-top:2px}
.lw-id{min-width:0}
.lw-av{display:block;width:34px;height:34px;flex:none;border-radius:50%;object-fit:cover;background:var(--lw-av)}
.lw-name{font-size:14px;font-weight:550;line-height:1.3;letter-spacing:-.006em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lw-sub{font-size:13px;line-height:1.35;color:var(--lw-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lw-brand{display:flex;justify-content:center;gap:14px;padding:14px 0 2px}
.lw-brand a{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--lw-faint);text-decoration:none;transition:color .18s}
.lw-brand a:hover{color:var(--lw-ink)}
.lw-empty{padding:48px 16px;text-align:center;color:var(--lw-muted);font-size:14px}
.lw-wall{columns:3 260px;column-gap:16px}
.lw-wall[data-cols]{columns:var(--cols) 220px}
.lw-wall .lw-card{break-inside:avoid;margin-bottom:16px}
.lw-wall+.lw-brand{padding-top:0}
.lw-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(max(240px,calc((100% - (var(--cols) - 1) * 16px) / var(--cols))),1fr))}
.lw-grid .lw-who{margin-top:auto;padding-top:2px}
.lw-list{max-width:760px;margin:0 auto;background:var(--lw-card);border:1px solid var(--lw-line);border-radius:var(--lw-r)}
.lw-li{display:flex;gap:14px;padding:20px 22px}
.lw-li+.lw-li{border-top:1px solid var(--lw-line)}
.lw-li-main{display:flex;flex:1;flex-direction:column;gap:10px;min-width:0}
.lw-li-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;min-width:0}
.lw-li .lw-av{width:38px;height:38px}
.lw-li .lw-video,.lw-li .lw-img{max-width:520px;margin:0}
.lw-car{position:relative}
.lw-track{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;scrollbar-width:none;padding:2px;margin:-2px;outline:none}
.lw-track::-webkit-scrollbar{display:none}
.lw-track .lw-card{flex:0 0 min(360px,86%);scroll-snap-align:start}
.lw-car[data-pv] .lw-track .lw-card{flex-basis:calc((100% - (var(--pv) - 1) * 16px) / var(--pv))}
.lw-car[data-pv="2"]{--pv:2}
.lw-car[data-pv="3"]{--pv:3}
@media (max-width:640px){.lw-car[data-pv] .lw-track .lw-card{flex-basis:86%}}
.lw-car[data-pv="1"]{max-width:760px;margin:0 auto}
.lw-car[data-pv="1"] .lw-track .lw-card{flex-basis:100%}
.lw-car[data-pv="1"] .lw-text{font-size:17px;line-height:1.55;letter-spacing:-.01em}
.lw-nav{display:flex;justify-content:center;gap:10px;margin-top:16px}
.lw-btn{display:grid;place-items:center;width:34px;height:34px;border-radius:8px;border:1px solid var(--lw-line);background:var(--lw-card);color:var(--lw-ink);cursor:pointer;transition:transform .18s cubic-bezier(.32,.72,0,1),opacity .2s}
.lw-btn:active{transform:scale(.9)}
.lw-btn:disabled{opacity:.35;cursor:default}
.lw-btn:focus-visible,.lw-track:focus-visible,a:focus-visible,.lw button:focus-visible{outline:2px solid var(--lw-accent);outline-offset:2px}
.lw-mq{display:flex;flex-direction:column;gap:16px;overflow:hidden;padding:2px 0;-webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
.lw-row{display:flex;width:max-content;animation:lw-scroll var(--dur) linear infinite}
.lw-row.rev{animation-direction:reverse}
.lw-mq:hover .lw-row,.lw-mq:focus-within .lw-row{animation-play-state:paused}
.lw-set{display:flex;gap:16px;padding-right:16px}
.lw-set .lw-card{width:320px;flex:none}
.lw-set .lw-text{display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}
@keyframes lw-scroll{to{transform:translateX(-50%)}}
.lw-gal{columns:3 220px;column-gap:14px}
.lw-gal[data-cols]{columns:var(--cols) 200px}
.lw-tile{break-inside:avoid;margin-bottom:14px;display:flex;flex-direction:column;gap:8px}
.lw-tile .lw-img{border:1px solid var(--lw-line);border-radius:var(--lw-r)}
.lw-tile .lw-img img{max-height:none;transition:transform .4s cubic-bezier(.16,1,.3,1)}
.lw-tile .lw-img:hover img{transform:scale(1.015)}
.lw-tile-cap{display:flex;align-items:center;gap:8px;min-width:0;padding:0 2px;font-size:13px}
.lw-tile-cap .lw-name{font-size:13px}
.lw-tile-cap .lw-sub{font-size:12.5px}
.lw-single{display:flex;flex-direction:column;align-items:center;gap:20px;max-width:680px;margin:0 auto;padding:28px 12px 8px;text-align:center}
.lw-single .lw-text{font-size:clamp(18px,3.2vw,24px);line-height:1.45;font-weight:450;letter-spacing:-.016em}
.lw-single .lw-video,.lw-single .lw-img{max-width:560px}
.lw-single .lw-who{flex-direction:column;gap:10px}
.lw-single .lw-av{width:48px;height:48px}
.lw-single .lw-name,.lw-single .lw-sub{white-space:normal}
.lw-hq{display:flex;flex-direction:column;gap:24px;max-width:920px;margin:0 auto;padding:24px 4px 8px}
.lw-hq .lw-text{font-size:clamp(24px,4.4vw,40px);line-height:1.28;font-weight:500;letter-spacing:-.024em;text-wrap:pretty}
.lw-hq .lw-who{gap:14px;margin-top:4px}
.lw-hq .lw-av{width:52px;height:52px}
.lw-hq .lw-name{font-size:17px;font-weight:600;white-space:normal}
.lw-hq .lw-sub{font-size:15px;white-space:normal}
.lw-hq-logo{display:block;box-sizing:content-box;filter:var(--lw-mono);height:28px;width:auto;max-width:150px;margin-left:6px;padding:8px 0 8px 20px;border-left:1px solid var(--lw-line);object-fit:contain}
@media (max-width:480px){.lw-hq-logo{display:none}}
.lw-t-hero .lw-brand{justify-content:flex-start;max-width:920px;margin:0 auto;padding-left:4px}
.lw-vid{display:flex;flex-direction:column;gap:16px;max-width:880px;margin:0 auto}
.lw-vid .lw-video{max-height:none;border-radius:var(--lw-r)}
.lw-vid .lw-who{gap:12px}
.lw-vid .lw-who .lw-stars{margin-left:auto}
.lw-vid .lw-av{width:42px;height:42px}
.lw-vid .lw-name{font-size:15px}
.lw-vid .lw-text{color:var(--lw-muted)}
.lw-vid .lw-play{width:68px;height:68px}
.lw-vid .lw-play svg{width:28px;height:28px}
.lw-pop{position:fixed;z-index:5;left:14px;right:14px;bottom:14px;display:flex;justify-content:flex-start;pointer-events:none}
.lw-pop[data-pos^=top]{bottom:auto;top:14px}
.lw-pop[data-pos$=right]{justify-content:flex-end}
.lw-pc{position:relative;width:100%;max-width:364px;display:flex;flex-direction:column;gap:8px;padding:14px 16px 15px;background:var(--lw-card);border:1px solid var(--lw-line);border-radius:var(--lw-r);box-shadow:var(--lw-float);pointer-events:auto;animation:lwc-in .42s cubic-bezier(.16,1,.3,1) both}
.lw-pop[data-pos^=top] .lw-pc{--lwc-y:-10px}
.lw-pc.lw-out{animation:lwc-out .24s cubic-bezier(.32,.72,0,1) both}
.lw-pc-head{display:flex;align-items:center;gap:10px;min-width:0;padding-right:22px}
.lw-pc .lw-id{display:flex;flex-direction:column;gap:2px}
.lw-pc .lw-text{font-size:14px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.lw-cover{text-decoration:none}
.lw-cover::after{content:"";position:absolute;inset:0;border-radius:inherit}
.lw-cover:focus-visible{outline:none}
.lw-cover:focus-visible::after{outline:2px solid var(--lw-accent);outline-offset:2px}
.lw-x{position:absolute;z-index:1;top:8px;right:8px;display:grid;place-items:center;width:26px;height:26px;border:0;border-radius:7px;background:transparent;color:var(--lw-faint);cursor:pointer;transition:background-color .15s,color .15s}
.lw-x:hover{background:var(--lw-av);color:var(--lw-ink)}
@keyframes lwc-in{from{opacity:0;transform:translateY(var(--lwc-y,10px)) scale(.98)}}
@keyframes lwc-out{to{opacity:0;transform:translateY(calc(var(--lwc-y,10px) * .5)) scale(.99)}}
.lw-badge{display:inline-flex;align-items:center;gap:10px;padding:8px 16px 8px 10px;border-radius:min(var(--lw-r),999px);background:var(--lw-card);border:1px solid var(--lw-line);color:var(--lw-ink);text-decoration:none;white-space:nowrap;transition:transform .2s cubic-bezier(.32,.72,0,1)}
.lw-badge:active{transform:scale(.97)}
.lw-badge-main{display:flex;flex-direction:column;gap:1px;padding-left:2px}
.lw-badge-line{display:flex;align-items:baseline;gap:6px;font-size:13px}
.lw-score{font-size:15px;font-weight:600;letter-spacing:-.01em}
.lw-dot,.lw-count{color:var(--lw-muted)}
.lw-faces{display:flex}
.lw-faces img{width:26px;height:26px;border-radius:50%;object-fit:cover;border:2px solid var(--lw-card);margin-left:-8px;background:var(--lw-av)}
.lw-faces img:first-child{margin-left:0}
.lw-badge-wrap{display:inline-block;padding:2px}
.lw-avs{display:inline-flex;align-items:center;gap:12px;padding:4px 6px 4px 4px;color:var(--lw-ink);text-decoration:none;white-space:nowrap;border-radius:10px}
.lw-stack{display:flex}
.lw-stack img,.lw-ini{width:34px;height:34px;flex:none;border-radius:50%;object-fit:cover;background:var(--lw-av);box-shadow:0 0 0 2px var(--lw-ring,var(--lw-card));margin-left:-9px}
.lw-stack>:first-child{margin-left:0}
.lw-ini{display:grid;place-items:center;font-size:12px;font-weight:600;letter-spacing:.01em;color:var(--lw-muted)}
.lw-avs-main{display:flex;flex-direction:column;gap:2px}
.lw-avs-rate{display:flex;align-items:center;gap:6px}
.lw-avs-rate .lw-score{font-size:13px}
.lw-avs-line{font-size:14px;color:var(--lw-muted)}
.lw-avs-line strong{font-weight:600;color:var(--lw-ink)}
.lw-logos{display:flex;flex-direction:column;align-items:center;gap:18px;padding:8px 0}
.lw-cap{font-size:13.5px;color:var(--lw-muted);text-align:center}
.lw-logo-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:20px 44px;list-style:none}
.lw-logo{display:block;height:30px;width:auto;max-width:132px;object-fit:contain}
.lw-word{display:block;font-size:19px;font-weight:600;letter-spacing:-.03em;color:var(--lw-ink);white-space:nowrap}
.lw-mono .lw-logo{filter:var(--lw-mono);opacity:.62;transition:opacity .2s}
.lw-mono .lw-word{color:var(--lw-muted)}
.lw-mono li:hover .lw-logo{opacity:1}
.lw-lb{position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;padding:56px 16px 28px;background:rgba(12,12,11,.86);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:lwc-fade .2s ease both}
.lw-lb figure{display:flex;flex-direction:column;align-items:center;gap:12px;max-width:min(1100px,100%);max-height:100%;margin:0}
.lw-lb img{display:block;max-width:100%;max-height:calc(100vh - 140px);border-radius:10px;object-fit:contain;background:#1c1c1b}
.lw-lb figcaption{font-size:13.5px;color:#d9d8d4;text-align:center}
.lw-lb button{position:absolute;display:grid;place-items:center;width:40px;height:40px;border:0;border-radius:10px;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;transition:background-color .15s}
.lw-lb button:hover{background:rgba(255,255,255,.18)}
.lw-lb button:focus-visible{outline:2px solid #fff;outline-offset:2px}
.lw-lb-x{top:12px;right:12px}
.lw-lb-prev{left:12px;top:50%;margin-top:-20px}
.lw-lb-next{right:12px;top:50%;margin-top:-20px}
@keyframes lwc-fade{from{opacity:0}}
@media (prefers-reduced-motion:reduce){.lw-row{animation:none}.lw-mq{overflow-x:auto}.lw-track{scroll-behavior:auto}.lw-pc,.lw-pc.lw-out,.lw-lb{animation:none}.lw-tile .lw-img img{transition:none}}`;

// Everything interactive, for the embed document and the wall page alike (one constant string, so its CSP hash
// never changes; the root element is <body> in the embed, [data-lw-root] on the wall page):
// sizes the iframe from inside (postMessage to embed.js), plays one video at a time inside its trimmed range,
// runs the carousel and the popup, opens images in a lightbox, filters the wall page by tag, and counts views
// (once the widget is actually on screen), clicks and plays, with no cookies.
export const WIDGET_SCRIPT = `(function(){
var d=document,w=window,R=d.querySelector("[data-lw-root]")||d.body,id=R.getAttribute("data-id"),mode=R.getAttribute("data-mode");
var track=R.getAttribute("data-track")==="1",embedded=w.parent!==w&&R===d.body,last="",modal=false,seen=false;
var reduce=w.matchMedia&&w.matchMedia("(prefers-reduced-motion: reduce)").matches,pop=d.querySelector(".lw-pop");
function host(){if(R!==d.body)return location.hostname;try{var a=location.ancestorOrigins;return new URL(a&&a.length?a[0]:d.referrer).hostname}catch(e){return""}}
function hit(t){if(!track)return;var body=JSON.stringify({w:id,t:t,h:host()});try{if(!navigator.sendBeacon||!navigator.sendBeacon("/api/e",body))fetch("/api/e",{method:"POST",body:body,keepalive:true})}catch(e){}}
function view(){if(!seen){seen=true;hit("view")}}
function post(){if(!embedded)return;var m={lovewall:id},x,c;
if(modal)m.modal=true;
else if(pop){c=pop.querySelector(".lw-on");m.float={pos:pop.getAttribute("data-pos"),phones:pop.getAttribute("data-phones")==="1"};m.show=!!c;m.height=c?Math.ceil(c.getBoundingClientRect().height)+28:0;m.width=0}
else{x=d.querySelector(".lw-inline");m.height=Math.ceil(d.body.getBoundingClientRect().height);m.width=x?Math.ceil(x.getBoundingClientRect().width)+4:0;m.inline=!!x}
var k=JSON.stringify(m);if(k===last)return;last=k;try{parent.postMessage(m,"*")}catch(e){}}
if(embedded){if(w.ResizeObserver){var ro=new ResizeObserver(post);ro.observe(d.body);if(pop)ro.observe(pop)}w.addEventListener("load",post);w.addEventListener("message",function(e){if(e.data&&e.data.lovewall==="ping"){last="";post()}});post();
var ld=d.getElementById("lw-ld");if(ld)try{parent.postMessage({lovewall:id,ld:ld.textContent},"*")}catch(e){}}
if(track&&!pop){var target=d.querySelector(".lw")||R;if(w.IntersectionObserver){var io=new IntersectionObserver(function(es){for(var i=0;i<es.length;i++){var e=es[i];if(e.isIntersecting&&(e.intersectionRatio>=.25||e.intersectionRect.height>=160)){view();io.disconnect()}}},{threshold:[0,.05,.1,.25,.5]});io.observe(target)}else view()}
function range(v){return[+v.getAttribute("data-start")||0,+v.getAttribute("data-end")||0]}
d.addEventListener("click",function(e){var t=e.target.closest?e.target:null;if(!t)return;
if(t.closest("a,.lw-more,.lw-zoom"))hit("click");
var b=t.closest(".lw-play");if(b){var box=b.parentElement,v=box.querySelector("video");box.classList.add("playing");v.controls=true;v.play();return}
var m=t.closest(".lw-more");if(m){var open=m.getAttribute("aria-expanded")!=="true";m.setAttribute("aria-expanded",open);m.textContent=open?"Show less":"Read more";m.previousElementSibling.classList.toggle("lw-open",open);return}
var z=t.closest(".lw-zoom");if(z){lightbox(z);return}
var f=t.closest(".lw-filters button");if(f)filter(f)});
d.addEventListener("play",function(e){var v=e.target,all=d.querySelectorAll("video"),r=range(v);for(var i=0;i<all.length;i++)if(all[i]!==v)all[i].pause();if(v.currentTime<r[0]-.3||(r[1]&&v.currentTime>=r[1]-.1))v.currentTime=r[0];if(!v.lwPlayed){v.lwPlayed=1;hit("play")}},true);
d.addEventListener("timeupdate",function(e){var v=e.target,r=range(v);if(r[1]&&v.currentTime>=r[1]){v.pause();v.currentTime=r[0]}},true);
d.addEventListener("seeking",function(e){var v=e.target,r=range(v);if(v.currentTime<r[0]-.3)v.currentTime=r[0];else if(r[1]&&v.currentTime>r[1])v.currentTime=r[1]-.05},true);
var lb=null,from=null,list=[],at=0;
var X='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="';
function shown(i){at=(i+list.length)%list.length;var z=list[at],img=lb.querySelector("img");img.src=z.getAttribute("data-src");img.alt=z.querySelector("img")?z.querySelector("img").alt:"";lb.querySelector("figcaption").textContent=z.getAttribute("data-caption")||""}
function lightbox(z){list=[].slice.call(d.querySelectorAll(".lw-zoom"));from=z;lb=d.createElement("div");lb.className="lw-lb";lb.setAttribute("role","dialog");lb.setAttribute("aria-modal","true");lb.setAttribute("aria-label","Image");
lb.innerHTML='<figure><img alt=""><figcaption></figcaption></figure><button type="button" class="lw-lb-x" aria-label="Close">'+X+'M6 6l12 12M18 6L6 18"/></svg></button>'+(list.length>1?'<button type="button" class="lw-lb-prev" aria-label="Previous">'+X+'M14.5 6l-6 6 6 6"/></svg></button><button type="button" class="lw-lb-next" aria-label="Next">'+X+'M9.5 6l6 6-6 6"/></svg></button>':"");
lb.addEventListener("click",function(e){var t=e.target;if(t.closest(".lw-lb-x")||t===lb)close();else if(t.closest(".lw-lb-prev"))shown(at-1);else if(t.closest(".lw-lb-next"))shown(at+1)});
d.body.appendChild(lb);shown(list.indexOf(z));d.documentElement.style.overflow="hidden";modal=true;post();lb.querySelector(".lw-lb-x").focus()}
function close(){if(!lb)return;lb.remove();lb=null;d.documentElement.style.overflow="";modal=false;last="";post();if(from)from.focus()}
d.addEventListener("keydown",function(e){if(!lb)return;if(e.key==="Escape")close();else if(e.key==="ArrowRight"&&list.length>1)shown(at+1);else if(e.key==="ArrowLeft"&&list.length>1)shown(at-1);else if(e.key==="Tab"){var b=lb.querySelectorAll("button"),i=[].indexOf.call(b,d.activeElement);e.preventDefault();b[(i+(e.shiftKey?b.length-1:1))%b.length].focus()}});
function filter(f){var bar=f.closest(".lw-filters"),bs=bar.querySelectorAll("button"),tag=f.getAttribute("data-tag"),cards=d.querySelectorAll("[data-tags]"),n=0;for(var i=0;i<bs.length;i++)bs[i].setAttribute("aria-pressed",bs[i]===f);for(var j=0;j<cards.length;j++){var hide=!!tag&&cards[j].getAttribute("data-tags").indexOf("|"+tag+"|")<0;cards[j].hidden=hide;if(!hide)n++}var s=d.querySelector(".lw-filter-status");if(s)s.textContent=n+(n===1?" testimonial":" testimonials")}
if(pop){var cards=pop.querySelectorAll(".lw-pc"),n=-1,timer=0,held=false,closed=false,every=Math.max(4,+pop.getAttribute("data-interval")||8)*1000,first=mode==="preview"?500:(+pop.getAttribute("data-delay")||0)*1000;
function on(){return pop.querySelector(".lw-on")}
function next(){if(closed||!cards.length)return;if(held){timer=setTimeout(next,800);return}n=(n+1)%cards.length;var c=cards[n];c.hidden=false;c.classList.remove("lw-out");c.classList.add("lw-on");post();view();timer=setTimeout(hide,every)}
function hide(){if(held){timer=setTimeout(hide,800);return}var c=on();if(!c)return;c.classList.add("lw-out");setTimeout(function(){c.hidden=true;c.classList.remove("lw-on","lw-out");post();if(!closed)timer=setTimeout(next,1600)},reduce?0:240)}
pop.addEventListener("mouseenter",function(){held=true});pop.addEventListener("mouseleave",function(){held=false});pop.addEventListener("focusin",function(){held=true});pop.addEventListener("focusout",function(){held=false});
pop.addEventListener("click",function(e){if(!e.target.closest(".lw-x"))return;closed=true;clearTimeout(timer);var c=on();if(c){c.hidden=true;c.classList.remove("lw-on")}post()});
timer=setTimeout(next,first)}
var c=d.querySelector(".lw-car");if(!c)return;var t=c.querySelector(".lw-track"),bs=c.querySelectorAll(".lw-btn"),timer2=null,paused=false;
function step(){var f=t.querySelector(".lw-card");return f?f.getBoundingClientRect().width+16:300}
function upd(){if(bs.length<2)return;bs[0].disabled=t.scrollLeft<4;bs[1].disabled=t.scrollLeft+t.clientWidth>=t.scrollWidth-4}
function go(dir){t.scrollBy({left:dir*step()})}
for(var i=0;i<bs.length;i++)bs[i].addEventListener("click",function(e){go(+e.currentTarget.getAttribute("data-dir"));stop()});
t.addEventListener("scroll",upd,{passive:true});t.addEventListener("keydown",function(e){if(e.key==="ArrowRight"){go(1);e.preventDefault()}if(e.key==="ArrowLeft"){go(-1);e.preventDefault()}});upd();
function stop(){if(timer2){clearInterval(timer2);timer2=null}}
if(c.getAttribute("data-autoplay")==="1"&&!reduce&&bs.length){c.addEventListener("mouseenter",function(){paused=true});c.addEventListener("mouseleave",function(){paused=false});c.addEventListener("focusin",function(){paused=true});c.addEventListener("pointerdown",stop);timer2=setInterval(function(){if(paused||d.hidden)return;if(t.scrollLeft+t.clientWidth>=t.scrollWidth-4)t.scrollTo({left:0});else go(1)},5000)}
})();`;

export function widgetDocument(input: RenderInput, opts: { nonce?: string; title?: string } = {}): string {
  const nonce = opts.nonce ? ` nonce="${esc(opts.nonce)}"` : "";
  const body = widgetBody(input);
  const content = input.type === "badge" ? `<div class="lw-badge-wrap">${body}</div>` : body;
  const css = customCss(input.config.css);
  // Star snippets ride along as data (never executed here); the script hands them to embed.js for the host page.
  const ld = input.mode === "embed" && input.config.snippets ? jsonLd(input) : "";
  return `<!doctype html><html lang="en" data-theme="${esc(input.config.theme)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(
    opts.title ?? `${input.space.name} testimonials`,
  )}</title><style${nonce}>${widgetCss(input.config)}</style>${css ? `<style${nonce}>${css}</style>` : ""}${
    ld ? `<script type="application/ld+json" id="lw-ld">${ld}</script>` : ""
  }</head><body class="lw-embed" data-id="${esc(input.widgetId)}" data-mode="${input.mode}"${
    input.mode === "embed" ? ' data-track="1"' : ""
  }>${content}<script${nonce}>${WIDGET_SCRIPT}</script></body></html>`;
}
