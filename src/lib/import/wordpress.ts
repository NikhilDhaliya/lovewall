import "server-only";
import { decodeEntities } from "@/lib/oembed";
import { getJson, getText } from "./http";
import { clip, htmlText, httpsOrNull, isoDate, stars } from "./parse";
import { ImportError, type Found, type Importer } from "./types";

// WordPress.org plugin reviews: the official plugins API (reviews with names and avatars) plus the official reviews
// feed for each review's own link.

export function parseWordPress(input: string): string | null {
  return input.match(/wordpress\.org\/(?:plugins|support\/plugin)\/([a-z0-9-]+)/i)?.[1]?.toLowerCase() ?? null;
}

const key = (title: string, name: string) => `${title}|${name}`.toLowerCase().replace(/\s+/g, " ").trim();

export function wordpressReviews(html: string, links: Map<string, string>, slug: string): Found[] {
  const items: Found[] = [];
  for (const block of html.split(/<div class="review">/).slice(1)) {
    const title = htmlText(block.match(/<h4 class="review-title">([\s\S]*?)<\/h4>/)?.[1] ?? "");
    const nameHtml = block.match(/class="reviewer-name">([\s\S]*?)<\/a>/)?.[1] ?? "";
    const name = htmlText(nameHtml.replace(/<small>[\s\S]*?<\/small>/, ""));
    const text = clip(htmlText(block.match(/<div class="review-body">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] ?? ""), 3000);
    if (!text) continue;
    const date = block.match(/<span class="review-date">([^<]+)<\/span>/)?.[1];
    const fallback = `https://wordpress.org/support/plugin/${slug}/reviews/#${encodeURIComponent(key(title, name).replace(/[^a-z0-9]+/g, "-"))}`;
    items.push({
      url: links.get(key(title, name)) ?? fallback,
      name: clip(name, 80) || "WordPress user",
      text,
      rating: stars(block.match(/data-rating="(\d)"/)?.[1]),
      date: date ? isoDate(`${decodeEntities(date)} 12:00 UTC`) : null,
      avatarUrl: httpsOrNull(decodeEntities(block.match(/<img[^>]*src='([^']+)'/)?.[1] ?? "").replace(/([?&])s=\d+/, "$1s=96")),
    });
  }
  return items;
}

// "Great plugin (5 stars)" by "Name" → its topic link.
export function wordpressFeedLinks(xml: string): Map<string, string> {
  const links = new Map<string, string>();
  for (const item of xml.split("<item>").slice(1)) {
    const title = decodeEntities(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").replace(/\s*\(\d stars?\)\s*$/, "");
    const creator = decodeEntities(item.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/)?.[1] ?? "").replace(/^<!\[CDATA\[|\]\]>$/g, "");
    const link = httpsOrNull(item.match(/<link>([^<]+)<\/link>/)?.[1]);
    if (link) links.set(key(title, creator), link);
  }
  return links;
}

export const wordpress: Importer = {
  id: "wordpress",
  async fetch(input) {
    const slug = parseWordPress(input);
    if (!slug) throw new ImportError("Use a link like wordpress.org/plugins/acme");
    const [info, feed] = await Promise.all([
      getJson<{ name?: string; sections?: { reviews?: string }; error?: string }>(
        "WordPress.org",
        `https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request%5Bslug%5D=${slug}&request%5Bfields%5D%5Breviews%5D=1`,
      ),
      getText("WordPress.org", `https://wordpress.org/support/plugin/${slug}/reviews/feed/`).catch(() => ""),
    ]);
    if (info.error) throw new ImportError("Plugin not found");
    return {
      label: clip(htmlText(info.name ?? ""), 80) || slug,
      input: `https://wordpress.org/plugins/${slug}/`,
      items: wordpressReviews(info.sections?.reviews ?? "", wordpressFeedLinks(feed), slug),
    };
  },
};
