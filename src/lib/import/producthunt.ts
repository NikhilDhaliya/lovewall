import "server-only";
import { jsonLdImporter } from "./review-page";

export function parseProductHunt(input: string): string | null {
  return input.match(/producthunt\.com\/products\/([a-z0-9-]+)/i)?.[1]?.toLowerCase() ?? null;
}

// Product reviews (not launch comments), from the reviews page's JSON-LD.
export const producthunt = jsonLdImporter("producthunt", "Product Hunt", "Use a link like producthunt.com/products/acme", (input) => {
  const slug = parseProductHunt(input);
  return slug ? `https://www.producthunt.com/products/${slug}/reviews` : null;
});
