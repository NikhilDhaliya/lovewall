import "server-only";
import { importKeys } from "@/lib/env";
import { parseJson, request } from "./http";
import { clip, httpsOrNull, isoDate, stars } from "./parse";
import { ImportError, type Found, type Importer } from "./types";

// Google reviews through the Places API (New), with GOOGLE_PLACES_API_KEY: a Maps link or a business name finds the
// place, then its reviews. Google shares at most five, the "most relevant" ones.

const PLACE_ID = /^[\w-]{20,300}$/;

// Place id from a link ("…?q=place_id:ChIJ…", "query_place_id=…"), else the place name in a /maps/place/<name> link.
export function parseGoogle(input: string): { placeId?: string; query?: string; link?: string } | null {
  const s = input.trim().slice(0, 500);
  if (!s) return null;
  const id = s.match(/(?:place_id[:=]|query_place_id=)([\w-]{20,300})/)?.[1];
  if (id) return { placeId: id };
  if (!/^https?:\/\//i.test(s) && !/^(www\.)?(google\.|maps\.|goo\.gl|g\.page)/i.test(s)) return { query: s };
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const name = u.pathname.match(/\/maps\/place\/([^/]+)/)?.[1];
    if (name) return { query: decodeURIComponent(name.replace(/\+/g, " ")) };
    const q = u.searchParams.get("q") ?? u.searchParams.get("query");
    if (q) return { query: q };
    // Short links (maps.app.goo.gl/…) redirect to a full Maps link.
    if (/^(maps\.app\.goo\.gl|goo\.gl|g\.page|g\.co)$/i.test(u.hostname)) return { link: u.toString() };
    return null;
  } catch {
    return { query: s };
  }
}

async function api<T>(url: string, opts: { body?: unknown; fields: string }): Promise<T> {
  const res = await request("Google", url, {
    accept: "application/json",
    method: opts.body ? "POST" : "GET",
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    headers: {
      "X-Goog-Api-Key": importKeys.google,
      "X-Goog-FieldMask": opts.fields,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    raw: true,
  });
  if (res.status === 400 || res.status === 401 || res.status === 403)
    throw new ImportError("Google refused the request. Check the API key.");
  if (res.status === 404) throw new ImportError("Place not found");
  if (res.status === 429) throw new ImportError("Google is busy. Try again later.");
  if (res.status !== 200) throw new ImportError("Google didn't answer. Try again.");
  return parseJson<T>("Google", res.body.toString("utf8"));
}

type Review = {
  name?: string;
  rating?: number;
  text?: { text?: string };
  originalText?: { text?: string };
  authorAttribution?: { displayName?: string; photoUri?: string };
  publishTime?: string;
  googleMapsUri?: string;
};

export function googleReviews(placeId: string, reviews: Review[]): Found[] {
  const items: Found[] = [];
  for (const r of reviews) {
    const text = clip(r.originalText?.text || r.text?.text, 3000);
    if (!text) continue;
    const reviewId = r.name?.split("/reviews/")[1] ?? `${r.authorAttribution?.displayName ?? ""}-${r.publishTime ?? ""}`;
    items.push({
      url:
        httpsOrNull(r.googleMapsUri) ?? `https://www.google.com/maps/place/?q=place_id:${placeId}#review-${encodeURIComponent(reviewId)}`,
      name: clip(r.authorAttribution?.displayName, 80) || "Google user",
      text,
      rating: stars(r.rating),
      date: isoDate(r.publishTime),
      avatarUrl: httpsOrNull(r.authorAttribution?.photoUri),
    });
  }
  return items;
}

export const google: Importer = {
  id: "google",
  enabled: () => Boolean(importKeys.google),
  async fetch(input) {
    if (!importKeys.google) throw new ImportError("Google reviews need an API key");
    let parsed = parseGoogle(input);
    if (!parsed) throw new ImportError("Paste a Maps link or type the business name");
    if (parsed.link) {
      const res = await request("Google Maps", parsed.link, { raw: true }).catch(() => null);
      parsed = res ? parseGoogle(res.url) : null;
      if (!parsed || parsed.link) throw new ImportError("Couldn't read that Maps link. Type the business name instead.");
    }
    let placeId = parsed.placeId;
    if (!placeId) {
      const found = await api<{ places?: { id?: string }[] }>("https://places.googleapis.com/v1/places:searchText", {
        body: { textQuery: parsed.query, pageSize: 1 },
        fields: "places.id",
      });
      placeId = found.places?.[0]?.id;
      if (!placeId) throw new ImportError("No place found. Try the full name and city.");
    }
    if (!PLACE_ID.test(placeId)) throw new ImportError("Place not found");
    const place = await api<{ displayName?: { text?: string }; formattedAddress?: string; reviews?: Review[] }>(
      `https://places.googleapis.com/v1/places/${placeId}`,
      { fields: "id,displayName,formattedAddress,reviews" },
    );
    return {
      label: clip(place.displayName?.text, 80) || "Google",
      input: `https://www.google.com/maps/place/?q=place_id:${placeId}`,
      items: googleReviews(placeId, place.reviews ?? []),
      note: "Google shares 5 reviews at most",
    };
  },
};
