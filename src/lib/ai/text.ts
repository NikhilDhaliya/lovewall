import { htmlText } from "@/lib/import/parse";

// Plain helpers for the AI features (no network, no server-only imports): unit tested.

// A best line must be the testimonial's own words, and shorter than the whole thing.
export function cleanHighlight(text: string, line: string): string | null {
  const h = line.trim().replace(/^["“”']+|["“”']+$/g, "");
  if (h.length < 12 || h.length > 300 || h.length > text.length * 0.85) return null;
  return text.includes(h) ? h : null;
}

function meta(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag?.match(/content=["']([^"']*)["']/i)?.[1]?.trim() || null;
}

// Colours the page uses most (greys, black and white left out): candidates for the brand colour.
export function pageColors(html: string, limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const m of html.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
    let hex = m[1].toLowerCase();
    if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    if (Math.max(r, g, b) - Math.min(r, g, b) < 24) continue;
    counts.set(`#${hex}`, (counts.get(`#${hex}`) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([c]) => c);
}

export function readPage(html: string) {
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
  const body = html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ");
  return {
    title,
    site: meta(html, "og:site_name"),
    description: meta(html, "description") ?? meta(html, "og:description"),
    themeColor: meta(html, "theme-color"),
    colors: pageColors(html),
    text: htmlText(body).replace(/\s+\n/g, "\n").slice(0, 8000),
  };
}
