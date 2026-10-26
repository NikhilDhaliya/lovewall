import NextLink from "next/link";
import type { ComponentProps } from "react";

// App links don't prefetch: a click that lands while Next 16 is prefetching a route with a loading.tsx can leave
// the page blank (vercel/next.js#99829, not merged yet). The app's pages are dynamic, so prefetching saved little.
export function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
