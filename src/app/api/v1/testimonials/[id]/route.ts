import { keyed, readJson, send } from "@/lib/api/http";
import { deleteTestimonial, getTestimonial, updateTestimonial } from "@/lib/api/service";

type Ctx = RouteContext<"/api/v1/testimonials/[id]">;

export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return keyed(request, "read", async (key) => send(await getTestimonial(key.spaceId, id, key.scope === "write")));
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return keyed(request, "write", async (key) => {
    const body = await readJson(request);
    if (body instanceof Response) return body;
    return send(await updateTestimonial(key.spaceId, id, body.body));
  });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return keyed(request, "write", async (key) => send(await deleteTestimonial(key.spaceId, id)));
}
