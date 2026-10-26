import { one } from "@/lib/db";
import { getOwnedSpace } from "@/lib/data/spaces";
import { rateLimit, tooMany } from "@/lib/rate-limit";
import { currentUser } from "@/lib/session";
import { presignDownload, storageConfigured } from "@/lib/storage";
import { slugify } from "@/lib/validation";

// Downloads a video testimonial with a readable filename ("ada-lovelace-2026-10-26.mp4"), for members only.
export async function GET(_request: Request, ctx: RouteContext<"/api/spaces/[space]/testimonials/[id]/video">) {
  const { space: spaceId, id } = await ctx.params;
  const user = await currentUser();
  if (!user) return new Response("Sign in", { status: 401 });
  const space = await getOwnedSpace(user.id, spaceId);
  if (!space || !/^[0-9A-Za-z]{8,32}$/.test(id) || !storageConfigured()) return new Response("Not found", { status: 404 });
  const limit = await rateLimit(`video-download:${user.id}`, 120, 3600);
  if (!limit.ok) return tooMany(limit);
  const t = await one<{ name: string; video_key: string | null; given_at: string }>(
    "select name, video_key, given_at from testimonials where id = $1 and space_id = $2",
    [id, space.id],
  );
  if (!t?.video_key) return new Response("Not found", { status: 404 });
  const ext = t.video_key.split(".").pop();
  const file = `${slugify(t.name) || "testimonial"}-${new Date(t.given_at).toISOString().slice(0, 10)}.${ext}`;
  return new Response(null, {
    status: 302,
    headers: { Location: await presignDownload(t.video_key, file), "Cache-Control": "private, no-store" },
  });
}
