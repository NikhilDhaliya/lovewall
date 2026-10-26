import { embedCsp } from "@/lib/csp";
import { getWidgetPayload } from "@/lib/data/public";
import { env } from "@/lib/env";
import { widgetDocument } from "@/lib/widget/render";

// Rendered on first request, then served from the cache (and the CDN) until the widget or its testimonials
// change: every such change calls updateTag(`widget:<id>`), which expires it at once.
export const dynamic = "force-static";
export const revalidate = 86400;
export async function generateStaticParams() {
  return [];
}

// The widget itself, as one small HTML document (no framework runtime).
export async function GET(_request: Request, ctx: RouteContext<"/embed/[id]">) {
  const { id } = await ctx.params;
  const payload = /^[0-9A-Za-z]{8,32}$/.test(id) ? await getWidgetPayload(id) : null;
  if (!payload) {
    return new Response("<!doctype html><title>Not found</title>", {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": embedCsp() },
    });
  }
  const html = widgetDocument({
    widgetId: payload.widget.id,
    type: payload.widget.type,
    config: payload.widget.config,
    items: payload.items,
    summary: payload.summary,
    space: payload.space,
    appUrl: env.appUrl,
    mode: "embed",
  });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": embedCsp(),
    },
  });
}
