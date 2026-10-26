import { decodeEntities } from "@/lib/oembed";
import type { Found } from "./types";

// Pure parsing helpers shared by the source modules (no network; unit-tested).

// HTML from another site becomes plain text: paragraphs and line breaks kept, every tag dropped, entities decoded.
export function htmlText(html: string): string {
  const text = String(html ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function clip(s: string | null | undefined, max: number): string {
  const t = String(s ?? "").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export function isoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const d = typeof value === "number" ? new Date(value < 1e12 ? value * 1000 : value) : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Ratings on any scale (out of 5, 10 or 100) become 1-5; anything else is no rating.
export function stars(value: unknown, best = 5): number | null {
  const n = Number(value);
  const scale = Number(best) > 0 ? Number(best) : 5;
  if (!Number.isFinite(n) || n <= 0) return null;
  const r = Math.round((n / scale) * 5);
  return r >= 1 && r <= 5 ? r : null;
}

export function httpsOrNull(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return null;
  try {
    const u = new URL(s.startsWith("//") ? `https:${s}` : s);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// Every <script type="application/ld+json"> block, parsed (broken ones skipped), @graph arrays flattened.
export function jsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      out.push(v as Record<string, unknown>);
      const graph = (v as Record<string, unknown>)["@graph"];
      if (graph) walk(graph);
    }
  };
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1].trim()));
    } catch {}
  }
  return out;
}

const isType = (o: Record<string, unknown>, type: string) => {
  const t = o["@type"];
  return t === type || (Array.isArray(t) && t.includes(type));
};

const nameOf = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return nameOf(v[0]);
  if (v && typeof v === "object") return String((v as Record<string, unknown>).name ?? "");
  return "";
};

const imageOf = (v: unknown): string | null => {
  if (typeof v === "string") return httpsOrNull(v);
  if (Array.isArray(v)) return imageOf(v[0]);
  if (v && typeof v === "object") return httpsOrNull((v as Record<string, unknown>).url ?? (v as Record<string, unknown>).contentUrl);
  return null;
};

// schema.org Review objects in a page's JSON-LD (Product Hunt, G2, Capterra, Trustpilot all publish them).
export function jsonLdReviews(html: string, pageUrl: string): { label: string; items: Found[] } {
  const objects = jsonLd(html);
  const reviews: Record<string, unknown>[] = [];
  let label = "";
  for (const o of objects) {
    if (isType(o, "Review")) reviews.push(o);
    const list = o.review ?? o.reviews;
    if (list)
      for (const r of Array.isArray(list) ? list : [list]) if (r && typeof r === "object") reviews.push(r as Record<string, unknown>);
    if (!label && !isType(o, "Review") && !isType(o, "BreadcrumbList") && typeof o.name === "string" && (o.aggregateRating || o.review)) {
      label = o.name;
    }
  }
  const seen = new Set<string>();
  const items: Found[] = [];
  for (const r of reviews) {
    if (!isType(r, "Review") && !r.reviewBody) continue;
    const rating = (r.reviewRating ?? {}) as Record<string, unknown>;
    let body = htmlText(String(r.reviewBody ?? r.description ?? ""));
    if (!body) {
      // Product Hunt puts some reviews only in "positiveNotes" (the long ones are the review itself).
      const notes = (r.positiveNotes as { itemListElement?: { name?: string }[] } | undefined)?.itemListElement ?? [];
      body = notes
        .map((n) => htmlText(String(n.name ?? "")))
        .filter((t) => t.length > 40)
        .join("\n\n");
    }
    const name = clip(htmlText(nameOf(r.author)), 80);
    const date = isoDate(r.datePublished ?? r.dateCreated);
    const url =
      httpsOrNull(r.url) ??
      httpsOrNull(r["@id"]) ??
      `${pageUrl}#review-${encodeURIComponent(`${name}-${date ?? ""}`.toLowerCase().replace(/\s+/g, "-"))}`;
    if (!body || seen.has(url)) continue;
    seen.add(url);
    items.push({
      url,
      name: name || "Anonymous",
      text: clip(body, 3000),
      rating: stars(rating.ratingValue, Number(rating.bestRating) || 5),
      date,
      avatarUrl: r.author && typeof r.author === "object" ? imageOf((r.author as Record<string, unknown>).image) : null,
    });
  }
  return { label: htmlText(label), items };
}

export function metaContent(html: string, property: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, "i");
  const alt = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, "i");
  return decodeEntities((html.match(re) ?? html.match(alt))?.[1] ?? "").trim();
}

export function pageTitle(html: string): string {
  return decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim();
}

// A file's type from its first bytes: JPEG, PNG, WebP, WebM, MP4 or MOV (anything else is null).
export function sniff(b: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  if (ascii(4, 8) === "ftyp") return /^qt/.test(ascii(8, 10)) ? "video/quicktime" : "video/mp4";
  return null;
}
