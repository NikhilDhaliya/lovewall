import { exportQuery, exportRecord, exportRows, toCsv } from "@/lib/data/export";
import { getOwnedSpace, requireRole } from "@/lib/data/spaces";
import { audit } from "@/lib/privacy";
import { rateLimit, tooMany } from "@/lib/rate-limit";
import { currentUser } from "@/lib/session";

// Every testimonial of a space (or the inbox's current filter) as CSV or JSON. Owner only, and logged: an export
// carries every giver's email.
export async function GET(request: Request, ctx: RouteContext<"/api/spaces/[space]/export">) {
  const { space: spaceId } = await ctx.params;
  const user = await currentUser();
  if (!user) return new Response("Sign in", { status: 401 });
  const space = await getOwnedSpace(user.id, spaceId);
  if (!space) return new Response("Not found", { status: 404 });
  if (!requireRole(space, "owner")) return new Response("Only the owner can export", { status: 403 });
  const limit = await rateLimit(`export:${user.id}`, 30, 3600);
  if (!limit.ok) return tooMany(limit);
  const f = exportQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
  const rows = await exportRows(space.id, f);
  await audit({ spaceId: space.id, actorId: user.id, action: "testimonials.export", detail: { count: rows.length, format: f.format } });
  const name = `${space.slug}-testimonials-${new Date().toISOString().slice(0, 10)}.${f.format}`;
  const headers = {
    "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (f.format === "json") {
    return new Response(JSON.stringify(rows.map(exportRecord), null, 2), {
      headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
    });
  }
  return new Response(toCsv(rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
}
