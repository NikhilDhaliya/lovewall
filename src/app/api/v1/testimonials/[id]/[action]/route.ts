import { keyed, notFound, readJson, send } from "@/lib/api/http";
import { updateMany } from "@/lib/api/service";

// Shortcuts: POST /testimonials/<id>/approve | hide | feature | unfeature, and /tags with { add, remove }.
const ACTIONS: Record<string, Record<string, unknown>> = {
  approve: { status: "approved" },
  hide: { status: "hidden" },
  feature: { featured: true },
  unfeature: { featured: false },
};

export async function POST(request: Request, ctx: RouteContext<"/api/v1/testimonials/[id]/[action]">) {
  const { id, action } = await ctx.params;
  if (!Object.hasOwn(ACTIONS, action) && action !== "tags") return notFound();
  return keyed(request, "write", async (key) => {
    let change = ACTIONS[action];
    if (action === "tags") {
      const body = await readJson(request);
      if (body instanceof Response) return body;
      const b = (body.body && typeof body.body === "object" ? body.body : {}) as { add?: unknown; remove?: unknown };
      change = { add_tags: b.add ?? [], remove_tags: b.remove ?? [] };
    }
    const out = await updateMany(key.spaceId, { ids: [id], ...change });
    return send(out.ok ? { ok: true, data: out.data[0] } : out);
  });
}
