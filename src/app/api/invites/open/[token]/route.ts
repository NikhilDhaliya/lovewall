import { after } from "next/server";
import { findInvite, markInvite } from "@/lib/invites";
import { ipKey } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";

// A transparent 1x1 GIF.
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

// Public: the tracking pixel in invite emails. Always answers with the image; records the first open.
export async function GET(request: Request, ctx: RouteContext<"/api/invites/open/[token]">) {
  const { token } = await ctx.params;
  const limit = await rateLimit(`invite-open:ip:${ipKey(request.headers)}`, 120, 600);
  if (limit.ok) {
    after(async () => {
      const invite = await findInvite(token);
      if (invite) await markInvite(invite.id, "opened");
    });
  }
  return new Response(GIF, {
    headers: { "Content-Type": "image/gif", "Content-Length": String(GIF.length), "Cache-Control": "no-store, max-age=0" },
  });
}
