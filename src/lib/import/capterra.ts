import "server-only";
import { jsonLdImporter } from "./review-page";

export function parseCapterra(input: string): { id: string; slug: string } | null {
  const m = input.match(/capterra\.[a-z.]+\/(?:p|reviews)\/(\d+)\/([^/?#\s]+)/i);
  return m ? { id: m[1], slug: m[2] } : null;
}

export const capterra = jsonLdImporter("capterra", "Capterra", "Use a link like capterra.com/p/123/Acme/reviews", (input) => {
  const p = parseCapterra(input);
  return p ? `https://www.capterra.com/p/${p.id}/${encodeURIComponent(decodeURIComponent(p.slug))}/reviews/` : null;
});
