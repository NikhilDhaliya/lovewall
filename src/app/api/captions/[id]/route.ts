import { one } from "@/lib/db";
import { ipKey } from "@/lib/ip";
import { rateLimit, tooMany } from "@/lib/rate-limit";

// Public: WebVTT captions of a video testimonial, for the players in widgets, the wall page and the inbox. Ids are
// random and unguessable, like the video's own link; spam has no captions.
export async function GET(request: Request, ctx: RouteContext<"/api/captions/[id]">) {
  const { id: raw } = await ctx.params;
  const id = raw.replace(/\.vtt$/, "");
  if (!/^[0-9A-Za-z]{8,32}$/.test(id)) return new Response("Not found", { status: 404 });
  const limit = await rateLimit(`captions:ip:${ipKey(request.headers)}`, 600, 600);
  if (!limit.ok) return tooMany(limit);
  const row = await one<{ vtt: string }>(
    "select c.vtt from ai_captions c join testimonials t on t.id = c.testimonial_id where c.testimonial_id = $1 and not t.spam",
    [id],
  );
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(row.vtt, {
    headers: {
      "Content-Type": "text/vtt; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
