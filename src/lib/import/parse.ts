import { decodeEntities } from "@/lib/oembed";

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
