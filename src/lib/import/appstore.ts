import "server-only";
import { decodeEntities } from "@/lib/oembed";
import { getJson, getText } from "./http";
import { clip, isoDate, stars } from "./parse";
import { ImportError, type Importer } from "./types";

// Apple's free customer reviews feed, any country store: the newest reviews, 50 a page. Its JSON flavour now and
// then answers empty while the XML one works, so XML comes first and JSON is the fallback.

type Review = { id: string; name: string; text: string; rating: string; date: string };
type Label = { label?: string };
type JsonEntry = { id?: Label; author?: { name?: Label }; content?: Label; updated?: Label; "im:rating"?: Label };

export function parseAppStore(input: string): { country: string; id: string } | null {
  const m = input.match(/(?:apps|itunes)\.apple\.com\/(?:([a-z]{2})\/)?(?:app\/)?(?:[^/?#]+\/)?id(\d{5,12})/i);
  return m ? { country: (m[1] ?? "us").toLowerCase(), id: m[2] } : null;
}

const tag = (xml: string, name: string) => decodeEntities(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? "").trim();

export function appStoreXml(xml: string): Review[] {
  return xml
    .split("<entry>")
    .slice(1)
    .filter((e) => e.includes("<im:rating>"))
    .map((e) => ({
      id: tag(e, "id"),
      name: tag(e.match(/<author>[\s\S]*?<\/author>/)?.[0] ?? "", "name"),
      text: decodeEntities(e.match(/<content type="text">([\s\S]*?)<\/content>/)?.[1] ?? "").trim(),
      rating: tag(e, "im:rating"),
      date: tag(e, "updated"),
    }));
}

function appStoreJson(data: { feed?: { entry?: JsonEntry | JsonEntry[] } }): Review[] {
  const raw = data.feed?.entry;
  return (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .filter((e) => e["im:rating"])
    .map((e) => ({
      id: e.id?.label ?? "",
      name: e.author?.name?.label ?? "",
      text: e.content?.label ?? "",
      rating: e["im:rating"]?.label ?? "",
      date: e.updated?.label ?? "",
    }));
}

export const appstore: Importer = {
  id: "appstore",
  async fetch(input) {
    const app = parseAppStore(input);
    if (!app) throw new ImportError("That isn't an App Store link");
    const base = `https://apps.apple.com/${app.country}/app/id${app.id}`;
    const feed = (page: number, format: "xml" | "json") =>
      `https://itunes.apple.com/${app.country}/rss/customerreviews/page=${page}/id=${app.id}/sortby=mostrecent/${format}`;
    const reviews: Review[] = [];
    for (let page = 1; page <= 3; page++) {
      let found = appStoreXml(await getText("the App Store", feed(page, "xml")));
      if (!found.length && page === 1) found = appStoreJson(await getJson("the App Store", feed(page, "json")));
      reviews.push(...found);
      if (found.length < 50) break;
    }
    let label = "";
    try {
      const look = await getJson<{ results?: { trackName?: string }[] }>(
        "the App Store",
        `https://itunes.apple.com/lookup?id=${app.id}&country=${app.country}`,
      );
      label = look.results?.[0]?.trackName ?? "";
    } catch {
      // The name is a nicety.
    }
    const items = reviews
      .filter((r) => r.id && r.text)
      .map((r) => ({
        url: `${base}?see-all=reviews#review-${r.id}`,
        name: clip(r.name, 80) || "App Store user",
        text: clip(r.text, 3000),
        rating: stars(r.rating),
        date: isoDate(r.date),
      }));
    return {
      label: clip(label, 80) || "App Store",
      input: base,
      items,
      note: items.length ? undefined : "Apple's feed is empty. Try again later.",
    };
  },
};
