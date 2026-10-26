import "server-only";
import { getText } from "./http";
import { clip, htmlText, httpsOrNull, isoDate, jsonLdReviews, stars } from "./parse";
import { ImportError, type Found, type Importer } from "./types";

// Trustpilot's public business page: the reviews are in the page's own data (__NEXT_DATA__), with JSON-LD as a
// fallback. Two pages, newest first. Trustpilot often refuses servers; the sheet then offers paste or screenshot.

export function parseTrustpilot(input: string): string | null {
  const s = input.trim();
  const m = s.match(/trustpilot\.com\/review\/([^/?#\s]+)/i);
  const domain = (m ? m[1] : /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s) ? s : "").toLowerCase();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null;
}

type Review = {
  id?: string;
  title?: string;
  text?: string;
  rating?: number;
  dates?: { publishedDate?: string; experiencedDate?: string };
  consumer?: { displayName?: string; imageUrl?: string; countryCode?: string };
};

export function trustpilotReviews(html: string, domain: string): { label: string; items: Found[] } {
  const data = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (data) {
    try {
      const props = JSON.parse(data)?.props?.pageProps ?? {};
      const reviews: Review[] = Array.isArray(props.reviews) ? props.reviews : [];
      const items = reviews
        .filter((r) => r.id && (r.text || r.title))
        .map((r) => ({
          url: `https://www.trustpilot.com/reviews/${r.id}`,
          name: clip(r.consumer?.displayName, 80) || "Trustpilot user",
          text: clip(htmlText(r.text || r.title || ""), 3000),
          rating: stars(r.rating),
          date: isoDate(r.dates?.publishedDate ?? r.dates?.experiencedDate),
          avatarUrl: httpsOrNull(r.consumer?.imageUrl),
        }));
      return { label: String(props.businessUnit?.displayName ?? ""), items };
    } catch {}
  }
  return jsonLdReviews(html, `https://www.trustpilot.com/review/${domain}`);
}

export const trustpilot: Importer = {
  id: "trustpilot",
  async fetch(input) {
    const domain = parseTrustpilot(input);
    if (!domain) throw new ImportError("Use a link like trustpilot.com/review/acme.com");
    const items: Found[] = [];
    let label = "";
    for (let page = 1; page <= 2; page++) {
      const html = await getText(
        "Trustpilot",
        `https://www.trustpilot.com/review/${domain}?sort=recency${page > 1 ? `&page=${page}` : ""}`,
      );
      const found = trustpilotReviews(html, domain);
      label ||= found.label;
      const before = items.length;
      for (const f of found.items) if (!items.some((i) => i.url === f.url)) items.push(f);
      if (items.length === before || found.items.length < 20) break;
    }
    return { label: clip(label, 80) || domain, input: `https://www.trustpilot.com/review/${domain}`, items };
  },
};
