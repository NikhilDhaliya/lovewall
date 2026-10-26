import "server-only";
import { getText } from "./http";
import { clip, httpsOrNull, isoDate, pageTitle, stars } from "./parse";
import { ImportError, type Found, type Importer } from "./types";

// Chrome Web Store reviews, read from the data the public reviews page ships with (the newest few).

export function parseChromeWebStore(input: string): string | null {
  const m = input.match(/(?:chromewebstore\.google\.com|chrome\.google\.com\/webstore)\/detail\/(?:[^/?#]+\/)?([a-p]{32})/i);
  return m ? m[1].toLowerCase() : null;
}

const at = (v: unknown, ...path: number[]): unknown => path.reduce<unknown>((o, k) => (Array.isArray(o) ? o[k] : undefined), v);

// Looks through each AF_initDataCallback block for an array of review rows: [uuid, [name, avatar], stars, text, [seconds]].
export function chromeReviews(html: string, extId: string): Found[] {
  for (const m of html.matchAll(/AF_initDataCallback\(\{key: '[^']+', hash: '[^']*', data:([\s\S]*?), sideChannel: \{\}\}\);/g)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const rows = at(data, 1);
    if (!Array.isArray(rows) || !rows.length || typeof at(rows[0], 0) !== "string" || typeof at(rows[0], 2) !== "number") continue;
    const items: Found[] = [];
    for (const r of rows) {
      const id = at(r, 0);
      const text = clip(String(at(r, 3) ?? ""), 3000);
      if (typeof id !== "string" || !text) continue;
      items.push({
        url: `https://chromewebstore.google.com/detail/${extId}/reviews#review-${encodeURIComponent(id)}`,
        name: clip(String(at(r, 1, 0) ?? ""), 80) || "Chrome user",
        text,
        rating: stars(at(r, 2)),
        date: isoDate(at(r, 4, 0)),
        avatarUrl: httpsOrNull(at(r, 1, 1)),
      });
    }
    return items;
  }
  return [];
}

export const chromewebstore: Importer = {
  id: "chromewebstore",
  async fetch(input) {
    const id = parseChromeWebStore(input);
    if (!id) throw new ImportError("Use the extension's Chrome Web Store link");
    const html = await getText("the Chrome Web Store", `https://chromewebstore.google.com/detail/${id}/reviews?hl=en`);
    const label = pageTitle(html)
      .replace(/^Reviews:\s*/i, "")
      .replace(/\s*-\s*Chrome Web Store\s*$/i, "");
    return {
      label: clip(label, 80) || "Chrome extension",
      input: `https://chromewebstore.google.com/detail/${id}`,
      items: chromeReviews(html, id),
    };
  },
};
