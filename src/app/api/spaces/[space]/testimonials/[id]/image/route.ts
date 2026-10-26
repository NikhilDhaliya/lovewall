import { one } from "@/lib/db";
import { getOwnedSpace } from "@/lib/data/spaces";
import { rateLimit, tooMany } from "@/lib/rate-limit";
import { currentUser } from "@/lib/session";
import { socialImage, socialQuery } from "@/lib/social-image";
import type { Testimonial } from "@/lib/types";
import { slugify } from "@/lib/validation";

// A testimonial as a PNG for social posts (square, landscape or story), for members of its space only.
export async function GET(request: Request, ctx: RouteContext<"/api/spaces/[space]/testimonials/[id]/image">) {
  const { space: spaceId, id } = await ctx.params;
  const user = await currentUser();
  if (!user) return new Response("Sign in", { status: 401 });
  const space = await getOwnedSpace(user.id, spaceId);
  if (!space || !/^[0-9A-Za-z]{8,32}$/.test(id)) return new Response("Not found", { status: 404 });
  const limit = await rateLimit(`social-image:${user.id}`, 240, 600);
  if (!limit.ok) return tooMany(limit);
  const t = await one<Testimonial>("select * from testimonials where id = $1 and space_id = $2", [id, space.id]);
  if (!t || !t.text) return new Response("Not found", { status: 404 });
  const opts = socialQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
  const image = await socialImage(t, space, opts);
  const headers = new Headers(image.headers);
  headers.set("Cache-Control", "private, no-store");
  if (opts.download === "1") {
    const file = `${slugify(t.name) || "testimonial"}-${opts.size}.png`;
    headers.set("Content-Disposition", `attachment; filename="${file}"`);
  }
  return new Response(image.body, { status: 200, headers });
}
