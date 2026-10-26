import { keyed, send } from "@/lib/api/http";
import { getWidget } from "@/lib/api/service";
import { getWidgetPayload } from "@/lib/data/public";
import { env } from "@/lib/env";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };

// Public, read-only JSON for a widget: the same testimonials the widget shows, for custom designs.
// With an API key (Authorization header) it is the keyed API instead: the widget itself, no CORS.
export async function GET(request: Request, ctx: RouteContext<"/api/v1/widgets/[id]">) {
  const { id } = await ctx.params;
  if (request.headers.has("authorization")) return keyed(request, "read", async (key) => send(await getWidget(key.spaceId, id)));
  const payload = /^[0-9A-Za-z]{8,32}$/.test(id) ? await getWidgetPayload(id) : null;
  if (!payload) return Response.json({ error: "Not found" }, { status: 404, headers: CORS });
  const { widget, space, items, summary } = payload;
  return Response.json(
    {
      widget: { id: widget.id, name: widget.name, type: widget.type, page: `${env.appUrl}/w/${widget.id}` },
      space: { name: space.name, logo: space.logo, website: space.website, collect: `${env.appUrl}/${space.slug}` },
      rating: summary,
      testimonials: items.map((t) => ({
        id: t.id,
        name: t.name,
        title: t.title,
        company: t.company,
        handle: t.handle,
        text: t.text,
        rating: t.rating,
        source: t.source,
        sourceUrl: t.sourceUrl,
        avatar: t.avatar,
        video: t.video,
        poster: t.poster,
        date: t.date,
        featured: t.featured,
        // True when the giver claimed a reward for it: show that next to the testimonial.
        rewarded: t.rewarded ?? false,
      })),
    },
    { headers: { ...CORS, "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=600" } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
