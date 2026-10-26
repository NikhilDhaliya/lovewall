import { keyed, send } from "@/lib/api/http";
import { unsubscribe } from "@/lib/api/service";

// REST Hooks unsubscribe.
export async function DELETE(request: Request, ctx: RouteContext<"/api/v1/hooks/[id]">) {
  const { id } = await ctx.params;
  return keyed(request, "read", async (key) => send(await unsubscribe(key.spaceId, id)));
}
