import { RESERVED_SLUGS } from "@/lib/validation";

// Custom domains (love.acme.com): which paths they serve. Plain module, no server imports: the proxy and the unit
// tests use it.

// What a request path on a custom domain maps to. Anything else is a 404 there: no app, no sign-in, no API.
export type DomainRoute =
  | { kind: "form"; slug: string | null } // "/" is the default form, "/<slug>" another form
  | { kind: "wall"; id: string } // a wall page of a widget in that space (and its share image)
  | { kind: "collect-api"; spaceId: string } // the form's own submit, upload, spin and spelling-help calls
  | { kind: "beacon" } // the wall page's view and click counts (/api/e)
  | { kind: "asset" }; // scripts, styles and icons the pages load

export function customDomainRoute(pathname: string): DomainRoute | null {
  if (pathname === "/") return { kind: "form", slug: null };
  if (pathname.startsWith("/_next/static/") || pathname.startsWith("/_next/image")) return { kind: "asset" };
  if (/^\/(favicon\.ico|icon\.svg|icon|apple-icon(\.png)?|manifest\.webmanifest)$/.test(pathname)) return { kind: "asset" };
  const wall = pathname.match(/^\/w\/([0-9A-Za-z]{8,32})(?:\/opengraph-image(?:-[0-9a-z]+)?)?\/?$/);
  if (wall) return { kind: "wall", id: wall[1] };
  const api = pathname.match(/^\/api\/collect\/([0-9A-Za-z]{8,32})(?:\/(?:upload|spin|polish))?$/);
  if (api) return { kind: "collect-api", spaceId: api[1] };
  if (pathname === "/api/e") return { kind: "beacon" };
  const form = pathname.match(/^\/([a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?)\/?$/);
  if (form && !RESERVED_SLUGS.has(form[1])) return { kind: "form", slug: form[1] };
  return null;
}

// Where a custom-domain path is served from inside the app. The space's own slug on its domain is the default form
// (wall pages link to "/<space-slug>").
export function customDomainRewrite(route: DomainRoute, pathname: string, spaceSlug: string): string {
  if (route.kind === "form") return route.slug && route.slug !== spaceSlug ? `/${spaceSlug}/${route.slug}` : `/${spaceSlug}`;
  return pathname;
}

// A hostname someone may add: lower case, at least one dot, no IPs, no ports, no wildcards.
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  s = s
    .replace(/^https?:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/\.$/, "");
  if (s.length > 253 || !s.includes(".")) return null;
  if (/^[\d.]+$/.test(s) || s.includes(":")) return null;
  const labels = s.split(".");
  if (!labels.every((l) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l))) return null;
  if (!/^[a-z]{2,63}$/.test(labels[labels.length - 1]) && !labels[labels.length - 1].startsWith("xn--")) return null;
  return s;
}

// Hosts that are never custom domains: this app, local addresses and platform preview hosts. Skips the lookup.
export function isPlatformHost(host: string, appHost: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  const app = appHost.toLowerCase().replace(/:\d+$/, "");
  return (
    !h ||
    h === app ||
    h === "localhost" ||
    h.endsWith(".localhost") ||
    /^[\d.]+$/.test(h) ||
    h.startsWith("[") ||
    h.endsWith(".vercel.app") ||
    !h.includes(".")
  );
}
