import { one } from "@/lib/db";

// Custom-domain lookups for the proxy, cached briefly in memory (misses too), so most requests skip the database.
type Site = { spaceId: string; slug: string };
const hosts = new Map<string, { site: Site | null; until: number }>();
const walls = new Map<string, { ok: boolean; until: number }>();

function remember<T>(map: Map<string, T>, key: string, value: T) {
  if (map.size > 2000) map.clear();
  map.set(key, value);
}

// The space a verified custom domain belongs to.
export async function resolveHost(host: string): Promise<Site | null> {
  const key = host.toLowerCase().replace(/:\d+$/, "");
  const hit = hosts.get(key);
  if (hit && hit.until > Date.now()) return hit.site;
  const row = await one<{ space_id: string; slug: string }>(
    "select d.space_id, s.slug from domains d join spaces s on s.id = d.space_id where d.domain = $1 and d.verified_at is not null",
    [key],
  ).catch(() => null);
  const site = row ? { spaceId: row.space_id, slug: row.slug } : null;
  remember(hosts, key, { site, until: Date.now() + (site ? 60_000 : 30_000) });
  return site;
}

export async function widgetInSpace(widgetId: string, spaceId: string): Promise<boolean> {
  const key = `${spaceId}:${widgetId}`;
  const hit = walls.get(key);
  if (hit && hit.until > Date.now()) return hit.ok;
  const ok = Boolean(await one("select 1 from widgets where id = $1 and space_id = $2", [widgetId, spaceId]).catch(() => null));
  remember(walls, key, { ok, until: Date.now() + 60_000 });
  return ok;
}
