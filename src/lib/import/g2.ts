import "server-only";
import { jsonLdImporter } from "./review-page";

export function parseG2(input: string): string | null {
  return input.match(/g2\.com\/products\/([a-z0-9-]+)/i)?.[1]?.toLowerCase() ?? null;
}

export const g2 = jsonLdImporter("g2", "G2", "Use a link like g2.com/products/acme/reviews", (input) => {
  const slug = parseG2(input);
  return slug ? `https://www.g2.com/products/${slug}/reviews` : null;
});
