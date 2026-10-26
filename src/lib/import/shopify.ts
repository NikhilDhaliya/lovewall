import "server-only";
import { getText } from "./http";
import { clip, htmlText, isoDate, metaContent, stars } from "./parse";
import { ImportError, type Found, type Importer } from "./types";

// Shopify App Store reviews, read from the public reviews page (newest first, two pages of 10).

export function parseShopify(input: string): string | null {
  const m = input.match(/apps\.shopify\.com\/([a-z0-9-]+)/i);
  return m && m[1] !== "search" && m[1] !== "categories" ? m[1].toLowerCase() : null;
}

export function shopifyReviews(html: string, handle: string): Found[] {
  const blocks = html.split(/<div[^>]*data-merchant-review[^>]*data-review-content-id="/).slice(1);
  const items: Found[] = [];
  for (const block of blocks) {
    const id = block.match(/^(\d+)"/)?.[1];
    if (!id) continue;
    const body = block.match(/data-truncate-content-copy[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
    const text = clip(htmlText(body), 3000);
    if (!text) continue;
    const date = block.match(/aria-label="\d out of 5 stars"[\s\S]*?<\/div>\s*<div[^>]*>\s*([A-Z][a-z]+ \d{1,2}, \d{4})\s*<\/div>/)?.[1];
    items.push({
      url: `https://apps.shopify.com/${handle}/reviews#review-${id}`,
      name: clip(htmlText(block.match(/<span[^>]*title="([^"]+)"/)?.[1] ?? ""), 80) || "Shopify merchant",
      text,
      rating: stars(block.match(/aria-label="(\d) out of 5 stars"/)?.[1]),
      date: date ? isoDate(`${date} 12:00 UTC`) : null,
    });
  }
  return items;
}

export const shopify: Importer = {
  id: "shopify",
  async fetch(input) {
    const handle = parseShopify(input);
    if (!handle) throw new ImportError("Use a link like apps.shopify.com/acme");
    const items: Found[] = [];
    let label = "";
    for (let page = 1; page <= 2; page++) {
      const html = await getText("Shopify", `https://apps.shopify.com/${handle}/reviews?sort_by=newest&page=${page}`);
      label ||= metaContent(html, "og:title");
      const found = shopifyReviews(html, handle);
      items.push(...found.filter((f) => !items.some((i) => i.url === f.url)));
      if (found.length < 10) break;
    }
    return {
      label: clip(label.replace(/^Reviews:\s*/i, "").split(/ [|–-] /)[0], 80) || handle,
      input: `https://apps.shopify.com/${handle}`,
      items,
    };
  },
};
