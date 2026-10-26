import "server-only";
import { getText } from "./http";
import { clip, jsonLdReviews, pageTitle } from "./parse";
import { ImportError, type Importer } from "./types";

// Review sites that publish schema.org reviews (JSON-LD) on their product pages: Product Hunt, G2, Capterra.
// G2 and Capterra usually refuse servers; the sheet then offers paste or screenshot.
export function jsonLdImporter(id: Importer["id"], site: string, hint: string, page: (input: string) => string | null): Importer {
  return {
    id,
    async fetch(input) {
      const url = page(input);
      if (!url) throw new ImportError(hint);
      const html = await getText(site, url);
      const found = jsonLdReviews(html, url);
      const label = found.label || pageTitle(html).split(/ [|:–-] /)[0];
      return { label: clip(label, 80) || site, input: url, items: found.items };
    },
  };
}
