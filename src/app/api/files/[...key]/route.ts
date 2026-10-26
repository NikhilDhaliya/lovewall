import { unstable_cache } from "next/cache";
import { one } from "@/lib/db";
import { presignGet, storageConfigured } from "@/lib/storage";

// Only files that a testimonial or space has claimed are served; everything else is a 404.
const isClaimed = (key: string) =>
  unstable_cache(
    async () => Boolean(await one("select 1 from uploads where key = $1 and claimed_at is not null", [key])),
    ["file-claimed", key],
    {
      revalidate: 300,
    },
  )();

export async function GET(_request: Request, ctx: RouteContext<"/api/files/[...key]">) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  if (
    !storageConfigured() ||
    !/^spaces\/[0-9A-Za-z]{8,32}\/(avatar|video|poster|logo|image)\/[0-9A-Za-z]{8,32}\.(jpg|png|webp|mp4|webm|mov)$/.test(key)
  ) {
    return new Response("Not found", { status: 404 });
  }
  if (!(await isClaimed(key))) return new Response("Not found", { status: 404 });
  const url = await presignGet(key);
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "public, max-age=1800, s-maxage=1800", "Access-Control-Allow-Origin": "*" },
  });
}
