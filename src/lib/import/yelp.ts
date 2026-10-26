import "server-only";
import { importKeys } from "@/lib/env";
import { parseJson, request } from "./http";
import { clip, httpsOrNull, isoDate, stars } from "./parse";
import { ImportError, type Importer } from "./types";

// Yelp reviews through the Fusion API, with YELP_API_KEY. Yelp shares three review excerpts per business.

export function parseYelp(input: string): string | null {
  const alias = input.match(/yelp\.[a-z.]+\/biz\/([^/?#\s]+)/i)?.[1];
  return alias && /^[\w%.-]{2,200}$/.test(alias) ? alias : null;
}

async function api<T>(path: string): Promise<T> {
  const res = await request("Yelp", `https://api.yelp.com/v3/${path}`, {
    accept: "application/json",
    headers: { Authorization: `Bearer ${importKeys.yelp}` },
    raw: true,
  });
  if (res.status === 401 || res.status === 403) throw new ImportError("Yelp refused the request. Check the API key.");
  if (res.status === 404) throw new ImportError("Business not found");
  if (res.status === 429) throw new ImportError("Yelp is busy. Try again later.");
  if (res.status !== 200) throw new ImportError("Yelp didn't answer. Try again.");
  return parseJson<T>("Yelp", res.body.toString("utf8"));
}

type Review = {
  id?: string;
  url?: string;
  text?: string;
  rating?: number;
  time_created?: string;
  user?: { name?: string; image_url?: string };
};

export const yelp: Importer = {
  id: "yelp",
  enabled: () => Boolean(importKeys.yelp),
  async fetch(input) {
    if (!importKeys.yelp) throw new ImportError("Yelp reviews need an API key");
    const alias = parseYelp(input);
    if (!alias) throw new ImportError("Use a link like yelp.com/biz/acme-san-francisco");
    const [biz, data] = await Promise.all([
      api<{ name?: string }>(`businesses/${alias}`),
      api<{ reviews?: Review[] }>(`businesses/${alias}/reviews?limit=20&sort_by=newest`),
    ]);
    const items = (data.reviews ?? [])
      .filter((r) => r.text && r.id)
      .map((r) => ({
        url: httpsOrNull(r.url) ?? `https://www.yelp.com/biz/${alias}?hrid=${encodeURIComponent(r.id!)}`,
        name: clip(r.user?.name, 80) || "Yelp user",
        text: clip(r.text, 3000),
        rating: stars(r.rating),
        // Yelp gives local time without a zone: close enough for ordering.
        date: isoDate(r.time_created?.replace(" ", "T")),
        avatarUrl: httpsOrNull(r.user?.image_url),
      }));
    return {
      label: clip(biz.name, 80) || "Yelp",
      input: `https://www.yelp.com/biz/${alias}`,
      items,
      note: "Yelp shares 3 reviews at most",
    };
  },
};
