import { z } from "zod";
import { recordHit, STAT_KINDS } from "@/lib/data/stats";
import { ipKey } from "@/lib/ip";
import { rateLimit, rateLimitAll, tooMany } from "@/lib/rate-limit";

// Widget analytics beacon (views, clicks, video plays), sent by the embed and the wall page with sendBeacon.
// No cookies and nothing about the visitor is stored: a count per widget per day, and the site's hostname.
const body = z.object({
  w: z.string().regex(/^[0-9A-Za-z]{8,32}$/),
  t: z.enum(STAT_KINDS),
  h: z.string().max(300).optional(),
});

const BOTS =
  /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl|wget|python|httpclient|okhttp|java\/|go-http|node-fetch|undici|axios|phantom|selenium|puppeteer|playwright|facebookexternalhit|embedly|whatsapp|telegram|discord|slack/i;

// Hostname only (no path, port or query), lowercased; anything odd counts as "unknown".
function hostname(value: string | undefined): string {
  const h = (value ?? "").trim().toLowerCase().replace(/\.$/, "");
  return /^(?=.{1,253}$)[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(h) && (h.includes(".") || h === "localhost") ? h : "";
}

// Which of our own pages sent the beacon: the widget's embed (an iframe on this app's origin) or its wall page (here,
// or on a custom domain, which serves /api/e itself). Browsers mark those requests same-origin and send the page's
// address as Referer; anything else (another site, or no fetch metadata at all: not a browser) is not counted.
function sender(request: Request, widgetId: string): { page: "embed" | "wall"; host: string } | null {
  if (request.headers.get("sec-fetch-site") !== "same-origin") return null;
  let from: URL;
  try {
    from = new URL(request.headers.get("referer") ?? "");
  } catch {
    return null;
  }
  if (from.pathname === `/embed/${widgetId}`) return { page: "embed", host: from.hostname };
  if (from.pathname === `/w/${widgetId}` || from.pathname === `/w/${widgetId}/`) return { page: "wall", host: from.hostname };
  return null;
}

export async function POST(request: Request) {
  // Cross-site requests are refused outright; requests without fetch metadata are dropped quietly below.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new Response(null, { status: 403 });
  const agent = request.headers.get("user-agent") ?? "";
  if (!agent || BOTS.test(agent)) return new Response(null, { status: 204 });
  if (Number(request.headers.get("content-length") ?? 0) > 1024) return new Response(null, { status: 413 });
  const raw = await request.text().catch(() => "");
  if (raw.length > 1024) return new Response(null, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return new Response(null, { status: 400 });
  const { w, t, h } = parsed.data;
  const from = sender(request, w);
  if (!from) return new Response(null, { status: 204 });

  const ip = ipKey(request.headers);
  const limit = await rateLimitAll([
    [`hit:ip:${ip}`, 300, 3600],
    [`hit:widget:${w}`, 20_000, 3600],
  ]);
  if (!limit.ok) return tooMany(limit);
  // A view counts once per visitor per widget every 30 minutes (reloads don't inflate it); clicks and plays are capped.
  const own = t === "view" ? await rateLimit(`hit:view:${ip}:${w}`, 1, 1800) : await rateLimit(`hit:${t}:${ip}:${w}`, 30, 600);
  if (!own.ok) return new Response(null, { status: t === "view" ? 204 : 429 });

  // The site: for a wall page, the host it was served on; for an embed, the page around it (only its script knows).
  const found = await recordHit(w, t, hostname(from.page === "wall" ? from.host : h));
  return new Response(null, { status: found ? 204 : 404 });
}
