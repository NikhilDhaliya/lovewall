import { z } from "zod";
import { fixGrammar } from "@/lib/ai/grammar";
import { grammarOn } from "@/lib/ai/settings";
import { one } from "@/lib/db";
import { checkFormToken } from "@/lib/form-token";
import { ipKey } from "@/lib/ip";
import { rateLimitAll, tooMany } from "@/lib/rate-limit";

const body = z.object({
  text: z.string().trim().min(12).max(3000),
  token: z.string().max(100),
});

// Public: a visitor asks for spelling and grammar fixes to their testimonial. Only a suggestion comes back; the
// visitor decides. Limited per visitor and per space (AI calls cost money), plus the space's daily AI cap.
export async function POST(request: Request, ctx: RouteContext<"/api/collect/[space]/polish">) {
  const { space: spaceId } = await ctx.params;
  if (!/^[0-9A-Za-z]{8,32}$/.test(spaceId)) return Response.json({ error: "Not found" }, { status: 404 });
  if (Number(request.headers.get("content-length") ?? 0) > 16 * 1024) return Response.json({ error: "Too large" }, { status: 413 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  if (checkFormToken(spaceId, parsed.data.token, 0) !== "ok")
    return Response.json({ error: "Reload the page and try again" }, { status: 400 });
  if (!(await one("select 1 from spaces where id = $1", [spaceId])) || !(await grammarOn(spaceId))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const ip = ipKey(request.headers);
  const limit = await rateLimitAll([
    [`polish:ip:${ip}`, 8, 600],
    [`polish:ip-day:${ip}`, 30, 86400],
    [`polish:space:${spaceId}`, 120, 3600],
  ]);
  if (!limit.ok) return tooMany(limit);
  const res = await fixGrammar(spaceId, parsed.data.text);
  if (!res.ok)
    return Response.json({ error: res.code === "cap" ? "Not available right now" : "Couldn't check it. Try again." }, { status: 503 });
  return Response.json({ text: res.data?.text ?? null });
}
