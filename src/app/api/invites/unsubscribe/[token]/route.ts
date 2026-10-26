import { findInvite, unsubscribe } from "@/lib/invites";
import { ipKey } from "@/lib/ip";
import { rateLimit, tooMany } from "@/lib/rate-limit";

// Public: unsubscribe from a space's invites. Mail clients post here directly (one-click, RFC 8058); the
// unsubscribe page's button posts a plain form and comes back to the page.
export async function POST(request: Request, ctx: RouteContext<"/api/invites/unsubscribe/[token]">) {
  const { token } = await ctx.params;
  const limit = await rateLimit(`invite-unsub:ip:${ipKey(request.headers)}`, 30, 600);
  if (!limit.ok) return tooMany(limit);
  const invite = await findInvite(token, undefined, { expired: true });
  if (!invite) return Response.json({ error: "Not found" }, { status: 404 });
  await unsubscribe(invite);
  const form = await request.text().catch(() => "");
  if (form.includes("List-Unsubscribe=One-Click")) return new Response("Unsubscribed", { status: 200 });
  return new Response(null, { status: 303, headers: { Location: `/i/${encodeURIComponent(token)}?done=1` } });
}
