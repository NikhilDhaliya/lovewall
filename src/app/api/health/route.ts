import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

// Liveness for Docker and uptime checks: the app answers and the database is reachable.
export async function GET() {
  try {
    await one("select 1");
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
