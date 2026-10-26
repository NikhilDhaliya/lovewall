import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { pageCsp } from "@/lib/csp";
import { customDomainRewrite, customDomainRoute, isPlatformHost } from "@/lib/domains";
import { resolveHost, widgetInSpace } from "@/lib/domain-resolve";
import { FloodGate, floodLimitFromEnv } from "@/lib/flood";
import { clientIp } from "@/lib/ip";

const gate = new FloodGate(floodLimitFromEnv(process.env.RATE_LIMIT_PER_MINUTE));

// Pages prerendered at build time (no request, so no nonce): the landing page, public wall pages, docs and guides.
function isStatic(path: string) {
  return path === "/" || path.startsWith("/w/") || path.startsWith("/docs/") || path === "/guides" || path.startsWith("/guides/");
}

// Paths the proxy used to skip entirely (API routes, embeds, files): they still pass straight through on the app's
// own host. The proxy only looks at them to keep custom domains to their few public pages.
const PASS =
  /^\/(api|embed)(\/|$)|^\/(_next\/static|_next\/image|favicon\.ico|icon|apple-icon|opengraph-image|embed\.js|avatar\.svg|robots\.txt|sitemap\.xml|manifest\.webmanifest)/;

function withNonce(headers: Headers) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = pageCsp({ nonce });
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  return policy;
}

const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

// A custom domain (love.acme.com) serves one space: "/" its default form, "/<form>" its other forms, "/w/<id>" wall
// pages of its own widgets. Nothing else: no app, no sign-in, and no cookies are passed on.
async function customDomain(request: NextRequest, site: { spaceId: string; slug: string }) {
  const path = request.nextUrl.pathname;
  const route = customDomainRoute(path);
  if (!route) return notFound();
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  if (route.kind === "asset" || route.kind === "beacon") return NextResponse.next({ request: { headers } });
  if (route.kind === "collect-api") return route.spaceId === site.spaceId ? NextResponse.next({ request: { headers } }) : notFound();
  if (route.kind === "wall") {
    if (!(await widgetInSpace(route.id, site.spaceId))) return notFound();
    const response = NextResponse.next({ request: { headers } });
    response.headers.set("Content-Security-Policy", pageCsp({}));
    return response;
  }
  const url = request.nextUrl.clone();
  url.pathname = customDomainRewrite(route, path, site.slug);
  const policy = withNonce(headers);
  const response = NextResponse.rewrite(url, { request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (!gate.allow(clientIp(request.headers))) {
    return new NextResponse("Too many requests. Try again later.", {
      status: 429,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": String(gate.retryAfter()) },
    });
  }

  const host = request.headers.get("host") ?? "";
  const appHost = new URL(process.env.APP_URL || "http://localhost:3000").host;
  if (!isPlatformHost(host, appHost)) {
    const site = await resolveHost(host);
    if (site) return customDomain(request, site);
  }

  if (PASS.test(path)) return NextResponse.next();

  // Optimistic gate for the app; pages and actions still check the session for real.
  if (path === "/app" || path.startsWith("/app/")) {
    if (!getSessionCookie(request, { cookiePrefix: "lovewall" })) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = path === "/app" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
      return NextResponse.redirect(url);
    }
  }

  if (isStatic(path)) {
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", pageCsp({}));
    return response;
  }

  const headers = new Headers(request.headers);
  const policy = withNonce(headers);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

// Every request but static build files, prefetches included: skipping requests that carry a prefetch header (as
// Next's CSP guide suggests, to save work) would let anyone skip the flood gate and the custom-domain rules by adding
// that header.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
